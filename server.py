#!/usr/bin/env python3
import json
import mimetypes
import os
import shutil
import sqlite3
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "app.sqlite"
JSON_PATH = DATA_DIR / "db.json"
BACKUP_DIR = DATA_DIR / "safety-backups"
WRITE_LOG_DIR = DATA_DIR / "write-logs"
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "4174"))

EMPTY_STATE = {
    "people": [],
    "requirements": [],
    "versions": [],
    "workItems": [],
    "holidays": [],
    "workdays": [],
}


def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


class ClientError(Exception):
    status = 400


def snapshot_data(reason):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    safe_reason = "".join(char if char.isalnum() or char in "-_" else "-" for char in reason)[:40]
    for source in (DB_PATH, JSON_PATH):
        if source.exists():
            target = BACKUP_DIR / f"{source.name}.{safe_reason}.{stamp}"
            shutil.copy2(source, target)


def log_write_request(method, remote, body):
    WRITE_LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    safe_remote = "".join(char if char.isalnum() or char in ".-_" else "-" for char in remote)[:60]
    (WRITE_LOG_DIR / f"{stamp}-{method}-{safe_remote}.json").write_text(body or "{}", encoding="utf-8")


def mirror_json():
    JSON_PATH.write_text(json.dumps(read_state(), ensure_ascii=False, indent=2), encoding="utf-8")


def stable_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def current_person(conn, person_id):
    row = conn.execute("SELECT id, name, role FROM people WHERE id = ?", (person_id,)).fetchone()
    return dict(row) if row else None


def current_requirement(conn, req_id):
    row = conn.execute("SELECT id, title, link, status, kind FROM requirements WHERE id = ?", (req_id,)).fetchone()
    if not row:
        return None
    req = dict(row)
    req["people"] = [
        person["person_name"]
        for person in conn.execute(
            "SELECT person_name FROM requirement_people WHERE requirement_id = ? ORDER BY sort_order, person_name",
            (req_id,),
        )
    ]
    return req


def current_version(conn, version_id):
    row = conn.execute("SELECT id, name, start, end FROM versions WHERE id = ?", (version_id,)).fetchone()
    if not row:
        return None
    version = dict(row)
    version["requirementIds"] = [
        req["requirement_id"]
        for req in conn.execute(
            "SELECT requirement_id FROM version_requirements WHERE version_id = ? ORDER BY sort_order, requirement_id",
            (version_id,),
        )
    ]
    return version


def current_work_item(conn, item_id):
    row = conn.execute(
        "SELECT id, requirement_id AS requirementId, person, start, end, content, images FROM work_items WHERE id = ?",
        (item_id,),
    ).fetchone()
    return {**dict(row), "images": json.loads(row["images"] or "[]")} if row else None


def check_patch_conflicts(conn, patch):
    base = patch.get("base") or {}
    upserts = patch.get("upserts") or {}
    checks = (
        ("people", current_person, "人员"),
        ("requirements", current_requirement, "需求"),
        ("versions", current_version, "版本"),
        ("workItems", current_work_item, "工作记录"),
    )
    for key, getter, label in checks:
        base_items = base.get(key) or {}
        for item in upserts.get(key) or []:
            item_id = item.get("id")
            if not item_id:
                raise ClientError(f"{label}缺少 id，保存已取消。")
            expected = base_items.get(item_id)
            current = getter(conn, item_id)
            if expected is None:
                if current is not None:
                    raise ClientError(f"{label}已经被其他人创建或修改，请刷新后重试。")
                continue
            if current is None or stable_json(current) != stable_json(expected):
                raise ClientError(f"{label}已被其他人修改，请刷新页面后再编辑，避免覆盖他人的内容。")


def table_counts(conn):
    return {
        "people": conn.execute("SELECT COUNT(*) FROM people").fetchone()[0],
        "requirements": conn.execute("SELECT COUNT(*) FROM requirements").fetchone()[0],
        "versions": conn.execute("SELECT COUNT(*) FROM versions").fetchone()[0],
        "work_items": conn.execute("SELECT COUNT(*) FROM work_items").fetchone()[0],
    }


def validate_core_counts(before, after):
    before_work = before["work_items"]
    after_work = after["work_items"]
    if before_work >= 20 and before_work - after_work > max(20, before_work // 2):
        raise ClientError("本次写入会导致大量工作记录消失，服务器已回滚。请刷新页面后重试。")
    before_req = before["requirements"]
    after_req = after["requirements"]
    if before_req >= 20 and before_req - after_req > max(20, before_req // 2):
        raise ClientError("本次写入会导致大量需求消失，服务器已回滚。请刷新页面后重试。")


def finish_checked_transaction(conn, before_counts):
    after_counts = table_counts(conn)
    validate_core_counts(before_counts, after_counts)
    conn.commit()


def init_db():
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS people (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              role TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS requirements (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              link TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL,
              kind TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS requirement_people (
              requirement_id TEXT NOT NULL,
              person_name TEXT NOT NULL,
              sort_order INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY (requirement_id, person_name),
              FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS versions (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              start TEXT NOT NULL,
              end TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS version_requirements (
              version_id TEXT NOT NULL,
              requirement_id TEXT NOT NULL,
              sort_order INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY (version_id, requirement_id),
              FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE,
              FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS work_items (
              id TEXT PRIMARY KEY,
              requirement_id TEXT NOT NULL,
              person TEXT NOT NULL,
              start TEXT NOT NULL,
              end TEXT NOT NULL,
              content TEXT NOT NULL DEFAULT '',
              images TEXT NOT NULL DEFAULT '[]',
              FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS holidays (
              date TEXT PRIMARY KEY
            );

            CREATE TABLE IF NOT EXISTS workdays (
              date TEXT PRIMARY KEY
            );
            """
        )
        columns = [row["name"] for row in conn.execute("PRAGMA table_info(work_items)")]
        if "images" not in columns:
            conn.execute("ALTER TABLE work_items ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")
    migrate_json_if_needed()


def has_rows(conn):
    tables = ["people", "requirements", "versions", "work_items", "holidays", "workdays"]
    return any(conn.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone() for table in tables)


def migrate_json_if_needed():
    if not JSON_PATH.exists():
        return
    with connect() as conn:
        if has_rows(conn):
            return
    try:
        state = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    except Exception:
        return
    if not has_state_data(state):
        return
    write_state(state)


def has_state_data(state):
    if not isinstance(state, dict):
        return False
    return any(isinstance(state.get(key), list) and state[key] for key in EMPTY_STATE)


def read_state():
    with connect() as conn:
        people = [dict(row) for row in conn.execute("SELECT id, name, role FROM people ORDER BY name")]
        requirements = []
        for row in conn.execute("SELECT id, title, link, status, kind FROM requirements ORDER BY title"):
            req = dict(row)
            req["people"] = [
                person["person_name"]
                for person in conn.execute(
                    "SELECT person_name FROM requirement_people WHERE requirement_id = ? ORDER BY sort_order, person_name",
                    (req["id"],),
                )
            ]
            requirements.append(req)
        versions = []
        for row in conn.execute("SELECT id, name, start, end FROM versions ORDER BY start, name"):
            version = dict(row)
            version["requirementIds"] = [
                req["requirement_id"]
                for req in conn.execute(
                    "SELECT requirement_id FROM version_requirements WHERE version_id = ? ORDER BY sort_order, requirement_id",
                    (version["id"],),
                )
            ]
            versions.append(version)
        work_items = [
            {**dict(row), "images": json.loads(row["images"] or "[]")}
            for row in conn.execute(
                "SELECT id, requirement_id AS requirementId, person, start, end, content, images FROM work_items ORDER BY start, person"
            )
        ]
        holidays = [row["date"] for row in conn.execute("SELECT date FROM holidays ORDER BY date")]
        workdays = [row["date"] for row in conn.execute("SELECT date FROM workdays ORDER BY date")]
    return {
        "people": people,
        "requirements": requirements,
        "versions": versions,
        "workItems": work_items,
        "holidays": holidays,
        "workdays": workdays,
    }


def write_state(state):
    state = state if isinstance(state, dict) else {}
    snapshot_data("write-state")
    with connect() as conn:
        conn.execute("BEGIN")
        before_counts = table_counts(conn)
        conn.executescript(
            """
            DELETE FROM version_requirements;
            DELETE FROM requirement_people;
            DELETE FROM work_items;
            DELETE FROM versions;
            DELETE FROM requirements;
            DELETE FROM people;
            DELETE FROM holidays;
            DELETE FROM workdays;
            """
        )
        for person in state.get("people") or []:
            conn.execute(
                "INSERT OR REPLACE INTO people (id, name, role) VALUES (?, ?, ?)",
                (person.get("id"), person.get("name", ""), person.get("role", "研发人员")),
            )
        for req in state.get("requirements") or []:
            conn.execute(
                "INSERT OR REPLACE INTO requirements (id, title, link, status, kind) VALUES (?, ?, ?, ?, ?)",
                (
                    req.get("id"),
                    req.get("title", "未命名需求"),
                    req.get("link", ""),
                    req.get("status", "未开始"),
                    req.get("kind", ""),
                ),
            )
            for index, name in enumerate(req.get("people") or []):
                conn.execute(
                    "INSERT OR REPLACE INTO requirement_people (requirement_id, person_name, sort_order) VALUES (?, ?, ?)",
                    (req.get("id"), name, index),
                )
        for version in state.get("versions") or []:
            conn.execute(
                "INSERT OR REPLACE INTO versions (id, name, start, end) VALUES (?, ?, ?, ?)",
                (version.get("id"), version.get("name", "未命名版本"), version.get("start"), version.get("end")),
            )
            for index, req_id in enumerate(version.get("requirementIds") or []):
                conn.execute(
                    "INSERT OR REPLACE INTO version_requirements (version_id, requirement_id, sort_order) VALUES (?, ?, ?)",
                    (version.get("id"), req_id, index),
                )
        for item in state.get("workItems") or []:
            conn.execute(
                "INSERT OR REPLACE INTO work_items (id, requirement_id, person, start, end, content, images) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    item.get("id"),
                    item.get("requirementId"),
                    item.get("person", ""),
                    item.get("start"),
                    item.get("end"),
                    item.get("content", ""),
                    json.dumps(item.get("images") or [], ensure_ascii=False),
                ),
            )
        for date in state.get("holidays") or []:
            conn.execute("INSERT OR REPLACE INTO holidays (date) VALUES (?)", (date,))
        for date in state.get("workdays") or []:
            conn.execute("INSERT OR REPLACE INTO workdays (date) VALUES (?)", (date,))
        finish_checked_transaction(conn, before_counts)
    mirror_json()
    return read_state()


def upsert_people(conn, people):
    for person in people or []:
        conn.execute(
            """
            INSERT INTO people (id, name, role) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role
            """,
            (person.get("id"), person.get("name", ""), person.get("role", "研发人员")),
        )


def upsert_requirements(conn, requirements):
    for req in requirements or []:
        req_id = req.get("id")
        conn.execute(
            """
            INSERT INTO requirements (id, title, link, status, kind) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              link = excluded.link,
              status = excluded.status,
              kind = excluded.kind
            """,
            (
                req_id,
                req.get("title", "未命名需求"),
                req.get("link", ""),
                req.get("status", "未开始"),
                req.get("kind", ""),
            ),
        )
        conn.execute("DELETE FROM requirement_people WHERE requirement_id = ?", (req_id,))
        for index, name in enumerate(req.get("people") or []):
            conn.execute(
                "INSERT OR REPLACE INTO requirement_people (requirement_id, person_name, sort_order) VALUES (?, ?, ?)",
                (req_id, name, index),
            )


def upsert_versions(conn, versions):
    for version in versions or []:
        version_id = version.get("id")
        conn.execute(
            """
            INSERT INTO versions (id, name, start, end) VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              start = excluded.start,
              end = excluded.end
            """,
            (version_id, version.get("name", "未命名版本"), version.get("start"), version.get("end")),
        )
        conn.execute("DELETE FROM version_requirements WHERE version_id = ?", (version_id,))
        for index, req_id in enumerate(version.get("requirementIds") or []):
            conn.execute(
                "INSERT OR REPLACE INTO version_requirements (version_id, requirement_id, sort_order) VALUES (?, ?, ?)",
                (version_id, req_id, index),
            )


def upsert_work_items(conn, work_items):
    for item in work_items or []:
        conn.execute(
            """
            INSERT INTO work_items (id, requirement_id, person, start, end, content, images) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              requirement_id = excluded.requirement_id,
              person = excluded.person,
              start = excluded.start,
              end = excluded.end,
              content = excluded.content,
              images = excluded.images
            """,
            (
                item.get("id"),
                item.get("requirementId"),
                item.get("person", ""),
                item.get("start"),
                item.get("end"),
                item.get("content", ""),
                json.dumps(item.get("images") or [], ensure_ascii=False),
            ),
        )


def merge_state(state):
    state = state if isinstance(state, dict) else {}
    snapshot_data("merge-state")
    with connect() as conn:
        conn.execute("BEGIN")
        before_counts = table_counts(conn)
        for person in state.get("people") or []:
            if not conn.execute("SELECT 1 FROM people WHERE id = ?", (person.get("id"),)).fetchone():
                upsert_people(conn, [person])
        for req in state.get("requirements") or []:
            if not conn.execute("SELECT 1 FROM requirements WHERE id = ?", (req.get("id"),)).fetchone():
                upsert_requirements(conn, [req])
        for version in state.get("versions") or []:
            if not conn.execute("SELECT 1 FROM versions WHERE id = ?", (version.get("id"),)).fetchone():
                upsert_versions(conn, [version])
        for item in state.get("workItems") or []:
            if not conn.execute("SELECT 1 FROM work_items WHERE id = ?", (item.get("id"),)).fetchone():
                upsert_work_items(conn, [item])
        for date in state.get("holidays") or []:
            conn.execute("INSERT OR REPLACE INTO holidays (date) VALUES (?)", (date,))
        for date in state.get("workdays") or []:
            conn.execute("INSERT OR REPLACE INTO workdays (date) VALUES (?)", (date,))
        finish_checked_transaction(conn, before_counts)
    mirror_json()
    return read_state()


def apply_patch_state(patch):
    patch = patch if isinstance(patch, dict) else {}
    upserts = patch.get("upserts") or {}
    deletes = patch.get("deletes") or {}
    calendar = patch.get("calendar") or {}
    delete_count = sum(len(deletes.get(key) or []) for key in ("people", "requirements", "versions", "workItems"))
    if delete_count > 20:
        raise ClientError("本次删除数量异常，服务器已拦截。请刷新页面确认数据后再操作。")
    snapshot_data("patch-state")
    with connect() as conn:
        conn.execute("BEGIN")
        before_counts = table_counts(conn)
        check_patch_conflicts(conn, patch)
        for item_id in deletes.get("workItems") or []:
            conn.execute("DELETE FROM work_items WHERE id = ?", (item_id,))
        for version_id in deletes.get("versions") or []:
            conn.execute("DELETE FROM versions WHERE id = ?", (version_id,))
        for req_id in deletes.get("requirements") or []:
            conn.execute("DELETE FROM requirements WHERE id = ?", (req_id,))
        for person_id in deletes.get("people") or []:
            conn.execute("DELETE FROM people WHERE id = ?", (person_id,))
        upsert_people(conn, upserts.get("people") or [])
        upsert_requirements(conn, upserts.get("requirements") or [])
        upsert_versions(conn, upserts.get("versions") or [])
        upsert_work_items(conn, upserts.get("workItems") or [])

        for date in calendar.get("removeHolidays") or []:
            conn.execute("DELETE FROM holidays WHERE date = ?", (date,))
        for date in calendar.get("removeWorkdays") or []:
            conn.execute("DELETE FROM workdays WHERE date = ?", (date,))
        for date in calendar.get("addHolidays") or []:
            conn.execute("INSERT OR REPLACE INTO holidays (date) VALUES (?)", (date,))
        for date in calendar.get("addWorkdays") or []:
            conn.execute("INSERT OR REPLACE INTO workdays (date) VALUES (?)", (date,))
        finish_checked_transaction(conn, before_counts)
    mirror_json()
    return read_state()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if urlparse(self.path).path == "/api/state":
            self.send_json(200, read_state())
            return
        super().do_GET()

    def do_PUT(self):
        if urlparse(self.path).path != "/api/state":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        try:
            log_write_request("PUT", self.client_address[0], body)
            state = json.loads(body or "{}")
            self.send_json(200, merge_state(state))
        except ClientError as error:
            self.send_json(error.status, {"error": str(error)})
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def do_PATCH(self):
        if urlparse(self.path).path != "/api/state":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        try:
            log_write_request("PATCH", self.client_address[0], body)
            patch = json.loads(body or "{}")
            self.send_json(200, apply_patch_state(patch))
        except ClientError as error:
            self.send_json(error.status, {"error": str(error)})
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    mimetypes.add_type("text/javascript; charset=utf-8", ".js")
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Demand calendar server listening on http://{HOST}:{PORT}")
    print(f"SQLite database: {DB_PATH}")
    server.serve_forever()
