FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl libgomp1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ml/src/ ./src/
COPY ml/models/ ./models/

RUN groupadd -g 1001 appgroup && useradd -u 1001 -g appgroup -s /bin/false appuser
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
