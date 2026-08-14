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
# migrate/collectstatic/createcachetable run here rather than as a Railway "pre-deploy"
# step: that separate ephemeral phase was observed NOT reliably receiving the service's
# environment variables (DJANGO_SECRET_KEY KeyError on every pre-deploy attempt, while the
# main container — this CMD — has always had it, proven by /health/ready/ returning 200).
# All three commands are idempotent (migrate no-ops with nothing to apply, collectstatic
# --noinput overwrites, createcachetable no-ops if the table exists), so running them on
# every boot is safe. `exec` hands off to gunicorn as PID 1 so it still receives signals
# directly for a clean shutdown.
CMD python manage.py migrate --noinput && \
    python manage.py collectstatic --noinput && \
    python manage.py createcachetable && \
    exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers 3 \
    --timeout 60 \
    --access-logfile - \
    --error-logfile -
