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
#
# process_jobs runs in this same container, in the background, rather than as a separate
# Railway service. Without it running SOMEWHERE, Stripe takes the money and the order is
# marked paid but no eSIM is ever ordered from the supplier — and the web app looks
# perfectly healthy while every customer waits forever.
#
# Co-locating it is safe: the command claims work with SELECT FOR UPDATE SKIP LOCKED (see
# its own help text), so it cannot double-process even if another copy is ever started,
# and it opens no port, so nothing collides with gunicorn.
#
# The `while true` wrapper is the load-bearing part. Backgrounding a bare `process_jobs`
# would mean that if it ever died, gunicorn would keep serving, the healthcheck would stay
# green, and provisioning would stop SILENTLY — the exact class of invisible failure this
# whole setup exists to prevent. Restarting it in a loop makes a crash self-healing and
# leaves a visible line in the logs each time it happens.
CMD python manage.py migrate --noinput && \
    python manage.py collectstatic --noinput && \
    python manage.py createcachetable && \
    python manage.py import_catalog && \
    python manage.py activate_demo_catalog --all && \
    ( while true; do \
        python manage.py process_jobs || echo "process_jobs exited unexpectedly; restarting in 5s"; \
        sleep 5; \
      done & ) && \
    exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers 3 \
    --timeout 60 \
    --access-logfile - \
    --error-logfile -
