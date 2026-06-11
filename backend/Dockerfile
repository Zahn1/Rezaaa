FROM python:3.12-slim
WORKDIR /srv/rezaa
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
ENV REZAA_DATA_DIR=/srv/rezaa/data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
