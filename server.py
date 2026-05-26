#!/usr/bin/env python3
import json
import mimetypes
import os
import shutil
import sqlite3
import secrets
import time
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "app.sqlite"
JSON_PATH = DATA_DIR / "db.json"
BACKUP_DIR = DATA_DIR / "safety-backups"
WRITE_LOG_DIR = DATA_DIR / "write-logs"
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "4174"))
SESSION_MAX_AGE = 60 * 60 * 24 * 14
DEFAULT_ACCOUNT_PASSWORD = "123456"
ADMIN_PASSWORD = "wl8430481"

ROLE_LABELS = {
    "admin": "管理员",
    "leader": "领导",
    "pm": "产品经理",
    "designer": "设计师",
    "developer": "研发人员",
    "tester": "测试人员",
}
ACCOUNT_ROLES_BY_PERSON_ROLE = {label: key for key, label in ROLE_LABELS.items()}

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


class AuthError(ClientError):
    status = 401


class ForbiddenError(ClientError):
    status = 403


def verify_password(password, stored):
    return secrets.compare_digest(password or "", stored or "")


def role_label(role):
    return ROLE_LABELS.get(role, "研发人员")


def role_from_person_role(person_role, fallback="developer"):
    return ACCOUNT_ROLES_BY_PERSON_ROLE.get(person_role, fallback if fallback in ROLE_LABELS else "developer")


def account_payload(row):
    keys = set(row.keys())
    person_name = row["person_name"] if "person_name" in keys else None
    person_role = row["person_role"] if "person_role" in keys else None
    role = role_from_person_role(person_role, row["role"])
    return {
        "id": row["id"],
        "username": row["username"],
        "personId": row["person_id"] if "person_id" in keys else "",
        "name": person_name or row["name"],
        "role": role,
        "roleLabel": role_label(role),
        "mustResetPassword": bool(row["password_reset_required"]) if "password_reset_required" in keys else False,
    }


def ensure_person_for_account(conn, account):
    name = (account.get("name") or "").strip()
    if not name:
        return ""
    existing = conn.execute("SELECT id FROM people WHERE name = ? LIMIT 1", (name,)).fetchone()
    person_id = existing["id"] if existing else f"account-{account['id']}"
    conn.execute(
        """
        INSERT INTO people (id, name, role) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role
        """,
        (person_id, name, role_label(account.get("role"))),
    )
    return person_id


def snapshot_data(reason):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    safe_reason = "".join(char if char.isalnum() or char in "-_" else "-" for char in reason)[:40]
    for source in (DB_PATH, JSON_PATH):
        if source.exists():
            target = BACKUP_DIR / f"{source.name}.{safe_reason}.{stamp}"
            shutil.copy2(source, target)


def log_write_request(method, remote, user, body):
    WRITE_LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    safe_remote = "".join(char if char.isalnum() or char in ".-_" else "-" for char in remote)[:60]
    safe_user = "".join(char if char.isalnum() or char in ".-_" else "-" for char in (user or "anonymous"))[:60]
    (WRITE_LOG_DIR / f"{stamp}-{method}-{safe_remote}-{safe_user}.json").write_text(body or "{}", encoding="utf-8")


def mirror_json():
    JSON_PATH.write_text(json.dumps(read_state(), ensure_ascii=False, indent=2), encoding="utf-8")


def stable_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def current_person(conn, person_id):
    row = conn.execute("SELECT id, name, role FROM people WHERE id = ?", (person_id,)).fetchone()
    return dict(row) if row else None


def current_requirement(conn, req_id):
    row = conn.execute("SELECT id, title, link, status, kind, created_by AS createdBy, created_by_name AS createdByName FROM requirements WHERE id = ?", (req_id,)).fetchone()
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
              kind TEXT NOT NULL DEFAULT '',
              created_by TEXT NOT NULL DEFAULT '',
              created_by_name TEXT NOT NULL DEFAULT ''
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

            CREATE TABLE IF NOT EXISTS accounts (
              id TEXT PRIMARY KEY,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              name TEXT NOT NULL,
              role TEXT NOT NULL,
              person_id TEXT NOT NULL DEFAULT '',
              password_reset_required INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              account_id TEXT NOT NULL,
              expires_at INTEGER NOT NULL,
              FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            );
            """
        )
        columns = [row["name"] for row in conn.execute("PRAGMA table_info(work_items)")]
        if "images" not in columns:
            conn.execute("ALTER TABLE work_items ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")
        requirement_columns = [row["name"] for row in conn.execute("PRAGMA table_info(requirements)")]
        if "created_by" not in requirement_columns:
            conn.execute("ALTER TABLE requirements ADD COLUMN created_by TEXT NOT NULL DEFAULT ''")
        if "created_by_name" not in requirement_columns:
            conn.execute("ALTER TABLE requirements ADD COLUMN created_by_name TEXT NOT NULL DEFAULT ''")
        account_columns = [row["name"] for row in conn.execute("PRAGMA table_info(accounts)")]
        if "person_id" not in account_columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN person_id TEXT NOT NULL DEFAULT ''")
        if "password_reset_required" not in account_columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN password_reset_required INTEGER NOT NULL DEFAULT 0")
        if not conn.execute("SELECT 1 FROM accounts WHERE username = ?", ("admin",)).fetchone():
            admin = {
                "id": "account-admin",
                "username": "admin",
                "name": "管理员",
                "role": "admin",
            }
            person_id = ensure_person_for_account(conn, admin)
            conn.execute(
                "INSERT INTO accounts (id, username, password_hash, name, role, person_id, password_reset_required) VALUES (?, ?, ?, ?, ?, ?, 0)",
                (admin["id"], admin["username"], ADMIN_PASSWORD, admin["name"], admin["role"], person_id),
            )
        else:
            admin_row = conn.execute("SELECT password_hash FROM accounts WHERE username = ?", ("admin",)).fetchone()
            if admin_row and "$" in (admin_row["password_hash"] or ""):
                conn.execute("UPDATE accounts SET password_hash = ?, password_reset_required = 0 WHERE username = ?", (ADMIN_PASSWORD, "admin"))
        for legacy_account in conn.execute("SELECT id, username, password_hash FROM accounts WHERE password_hash LIKE '%$%'").fetchall():
            if legacy_account["username"] == "admin":
                conn.execute("UPDATE accounts SET password_hash = ?, password_reset_required = 0 WHERE id = ?", (ADMIN_PASSWORD, legacy_account["id"]))
            else:
                conn.execute(
                    "UPDATE accounts SET password_hash = ?, password_reset_required = 1 WHERE id = ?",
                    (DEFAULT_ACCOUNT_PASSWORD, legacy_account["id"]),
                )
        for account in conn.execute("SELECT id, name, role, person_id FROM accounts WHERE person_id = '' OR person_id IS NULL").fetchall():
            person_id = ensure_person_for_account(conn, dict(account))
            if person_id:
                conn.execute("UPDATE accounts SET person_id = ? WHERE id = ?", (person_id, account["id"]))
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


def list_accounts():
    with connect() as conn:
        return [
            account_payload(row)
            for row in conn.execute(
                """
                SELECT accounts.id, accounts.username, accounts.name, accounts.role, accounts.person_id, accounts.password_reset_required,
                       people.name AS person_name, people.role AS person_role
                FROM accounts
                LEFT JOIN people ON people.id = accounts.person_id
                ORDER BY accounts.username
                """
            )
        ]


def get_account_by_session(token):
    if not token:
        return None
    now = int(time.time())
    with connect() as conn:
        row = conn.execute(
            """
            SELECT accounts.id, accounts.username, accounts.name, accounts.role, accounts.person_id, accounts.password_reset_required,
                   people.name AS person_name, people.role AS person_role
            FROM sessions
            JOIN accounts ON accounts.id = sessions.account_id
            LEFT JOIN people ON people.id = accounts.person_id
            WHERE sessions.token = ? AND sessions.expires_at > ?
            """,
            (token, now),
        ).fetchone()
    return account_payload(row) if row else None


def create_session(account_id):
    token = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + SESSION_MAX_AGE
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
        conn.execute("INSERT INTO sessions (token, account_id, expires_at) VALUES (?, ?, ?)", (token, account_id, expires_at))
        conn.commit()
    return token


def login_account(username, password):
    with connect() as conn:
        row = conn.execute(
            """
            SELECT accounts.id, accounts.username, accounts.password_hash, accounts.name, accounts.role, accounts.person_id, accounts.password_reset_required,
                   people.name AS person_name, people.role AS person_role
            FROM accounts
            LEFT JOIN people ON people.id = accounts.person_id
            WHERE accounts.username = ?
            """,
            ((username or "").strip(),),
        ).fetchone()
    if not row or not verify_password(password or "", row["password_hash"]):
        raise AuthError("账号或密码错误。")
    token = create_session(row["id"])
    return token, account_payload(row)


def save_account(data):
    username = (data.get("username") or "").strip()
    person_id = (data.get("personId") or "").strip()
    account_id = data.get("id") or f"account-{secrets.token_hex(8)}"
    if not username or not person_id:
        raise ClientError("请选择登录账号要绑定的人员。")
    with connect() as conn:
        person = conn.execute("SELECT id, name, role FROM people WHERE id = ?", (person_id,)).fetchone()
        if not person:
            raise ClientError("绑定的人员不存在，请先在人员管理中创建。")
        name = person["name"]
        role = role_from_person_role(person["role"])
        existing = conn.execute("SELECT id FROM accounts WHERE username = ? AND id <> ?", (username, account_id)).fetchone()
        if existing:
            raise ClientError("这个账号名已经存在。")
        existing_person = conn.execute("SELECT username FROM accounts WHERE person_id = ? AND id <> ?", (person_id, account_id)).fetchone()
        if existing_person:
            raise ClientError(f"人员「{name}」已经绑定了账号 {existing_person['username']}。")
        current = conn.execute("SELECT password_hash FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if current:
            conn.execute(
                "UPDATE accounts SET username = ?, name = ?, role = ?, person_id = ? WHERE id = ?",
                (username, name, role, person_id, account_id),
            )
        else:
            conn.execute(
                "INSERT INTO accounts (id, username, password_hash, name, role, person_id, password_reset_required) VALUES (?, ?, ?, ?, ?, ?, 1)",
                (account_id, username, DEFAULT_ACCOUNT_PASSWORD, name, role, person_id),
            )
        conn.commit()
    return list_accounts()


def change_password(token, current_password, new_password):
    if not token:
        raise AuthError("请先登录。")
    new_password = (new_password or "").strip()
    if len(new_password) < 6:
        raise ClientError("新密码至少需要 6 位。")
    if new_password == DEFAULT_ACCOUNT_PASSWORD:
        raise ClientError("新密码不能继续使用初始密码。")
    with connect() as conn:
        now = int(time.time())
        row = conn.execute(
            """
            SELECT accounts.id, accounts.password_hash
            FROM sessions
            JOIN accounts ON accounts.id = sessions.account_id
            WHERE sessions.token = ? AND sessions.expires_at > ?
            """,
            (token, now),
        ).fetchone()
        if not row:
            raise AuthError("登录已过期，请重新登录。")
        if not verify_password(current_password or "", row["password_hash"]):
            raise AuthError("当前密码不正确。")
        conn.execute("UPDATE accounts SET password_hash = ?, password_reset_required = 0 WHERE id = ?", (new_password, row["id"]))
        conn.execute("DELETE FROM sessions WHERE account_id = ?", (row["id"],))
        conn.commit()


def delete_account(account_id):
    if account_id == "account-admin":
        raise ClientError("默认 admin 账号不能删除。")
    with connect() as conn:
        row = conn.execute("SELECT id FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not row:
            raise ClientError("账号不存在。")
        conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        conn.commit()
    return list_accounts()


def read_state():
    with connect() as conn:
        people = [dict(row) for row in conn.execute("SELECT id, name, role FROM people ORDER BY name")]
        requirements = []
        for row in conn.execute("SELECT id, title, link, status, kind, created_by AS createdBy, created_by_name AS createdByName FROM requirements ORDER BY title"):
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
                "INSERT OR REPLACE INTO requirements (id, title, link, status, kind, created_by, created_by_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    req.get("id"),
                    req.get("title", "未命名需求"),
                    req.get("link", ""),
                    req.get("status", "未开始"),
                    req.get("kind", ""),
                    req.get("createdBy") or req.get("created_by") or "",
                    req.get("createdByName") or req.get("created_by_name") or "",
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
            INSERT INTO requirements (id, title, link, status, kind, created_by, created_by_name) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              link = excluded.link,
              status = excluded.status,
              kind = excluded.kind,
              created_by = excluded.created_by,
              created_by_name = excluded.created_by_name
            """,
            (
                req_id,
                req.get("title", "未命名需求"),
                req.get("link", ""),
                req.get("status", "未开始"),
                req.get("kind", ""),
                req.get("createdBy") or req.get("created_by") or "",
                req.get("createdByName") or req.get("created_by_name") or "",
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

    def session_token(self):
        cookie = self.headers.get("Cookie", "")
        for part in cookie.split(";"):
            name, _, value = part.strip().partition("=")
            if name == "gantetu_session":
                return value
        return ""

    def current_user(self):
        return get_account_by_session(self.session_token())

    def require_user(self):
        user = self.current_user()
        if not user:
            raise AuthError("请先登录。")
        if user.get("mustResetPassword"):
            raise AuthError("请先修改初始密码。")
        return user

    def require_admin(self):
        user = self.require_user()
        if user["role"] != "admin":
            raise ForbiddenError("只有管理员可以管理账号。")
        return user

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        return body, json.loads(body or "{}")

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/session":
            user = self.current_user()
            if not user:
                self.send_json(401, {"error": "请先登录。"})
                return
            self.send_json(200, {"user": user})
            return
        if parsed.path == "/api/accounts":
            try:
                self.require_admin()
                self.send_json(200, {"accounts": list_accounts()})
            except ClientError as error:
                self.send_json(error.status, {"error": str(error)})
            return
        if parsed.path == "/api/state":
            try:
                self.require_user()
                self.send_json(200, read_state())
            except ClientError as error:
                self.send_json(error.status, {"error": str(error)})
            return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/login":
            try:
                _, data = self.read_json_body()
                token, user = login_account(data.get("username"), data.get("password"))
                self.send_json(200, {"user": user}, cookie=f"gantetu_session={token}; Path=/; Max-Age={SESSION_MAX_AGE}; HttpOnly; SameSite=Lax")
            except ClientError as error:
                self.send_json(error.status, {"error": str(error)})
            except Exception as error:
                self.send_json(500, {"error": str(error)})
            return
        if parsed.path == "/api/logout":
            token = self.session_token()
            with connect() as conn:
                conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
                conn.commit()
            self.send_json(200, {"ok": True}, cookie="gantetu_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
            return
        if parsed.path == "/api/change-password":
            try:
                token = self.session_token()
                _, data = self.read_json_body()
                change_password(token, data.get("currentPassword"), data.get("newPassword"))
                self.send_json(200, {"ok": True}, cookie="gantetu_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
            except ClientError as error:
                self.send_json(error.status, {"error": str(error)})
            except Exception as error:
                self.send_json(500, {"error": str(error)})
            return
        if parsed.path == "/api/accounts":
            try:
                self.require_admin()
                _, data = self.read_json_body()
                self.send_json(200, {"accounts": save_account(data)})
            except ClientError as error:
                self.send_json(error.status, {"error": str(error)})
            except Exception as error:
                self.send_json(500, {"error": str(error)})
            return
        self.send_error(404)

    def do_PUT(self):
        if urlparse(self.path).path != "/api/state":
            self.send_error(404)
            return
        try:
            user = self.require_user()
            body, state = self.read_json_body()
            log_write_request("PUT", self.client_address[0], user["username"], body)
            self.send_json(200, merge_state(state))
        except ClientError as error:
            self.send_json(error.status, {"error": str(error)})
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def do_PATCH(self):
        if urlparse(self.path).path != "/api/state":
            self.send_error(404)
            return
        try:
            user = self.require_user()
            body, patch = self.read_json_body()
            log_write_request("PATCH", self.client_address[0], user["username"], body)
            self.send_json(200, apply_patch_state(patch))
        except ClientError as error:
            self.send_json(error.status, {"error": str(error)})
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/accounts":
            self.send_error(404)
            return
        try:
            self.require_admin()
            account_id = (parse_qs(parsed.query).get("id") or [""])[0]
            self.send_json(200, {"accounts": delete_account(account_id)})
        except ClientError as error:
            self.send_json(error.status, {"error": str(error)})
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def send_json(self, status, payload, cookie=None):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    mimetypes.add_type("text/javascript; charset=utf-8", ".js")
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Demand calendar server listening on http://{HOST}:{PORT}")
    print(f"SQLite database: {DB_PATH}")
    server.serve_forever()
