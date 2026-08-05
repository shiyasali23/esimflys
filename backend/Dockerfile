FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install .

COPY . .

EXPOSE 8000

# Shell form, not exec form: $PORT has to be expanded at runtime. Railway assigns the port
# and it is not 8000 — binding a literal port leaves the container unreachable and the
# healthcheck times out with nothing useful in the logs. The default keeps `docker run`
# working locally, where PORT is unset.
#
# railway.json's startCommand overrides this for the web service; the worker service
# overrides it with `python manage.py process_jobs`.
CMD gunicorn config.wsgi:application \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers 3 \
    --timeout 60 \
    --access-logfile - \
    --error-logfile -
