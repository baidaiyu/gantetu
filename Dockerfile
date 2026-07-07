FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=4174

WORKDIR /app

COPY index.html server.py server.mjs preview.png ./
COPY assets ./assets
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh && mkdir -p ./data

VOLUME ["/app/data"]
EXPOSE 4174

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["python", "server.py"]
