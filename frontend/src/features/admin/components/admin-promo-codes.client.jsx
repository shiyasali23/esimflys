"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { fetchPromoCodes, createPromoCode, updatePromoCode } from "@/lib/api/admin";
import { fieldErrors } from "@/lib/api/errors";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import {
  AdminToolbar,
  ToolbarSearch,
  ToolbarSelect,
} from "@/features/admin/components/admin-toolbar.client";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { useFocusOnReveal } from "@/lib/a11y/use-focus-on-reveal.client";
import { cn } from "@/lib/cn";

const FILTERS = [
  { value: "", label: "All" },
  { value: "true", label: "Active" },
  { value: "false", label: "Retired" },
];

/**
 * Discount codes — the kind that reduces what a customer pays.
 *
 * NOT agency referral codes. Those live in the same database table but carry no
 * discount and belong to an organization; they are issued per-agency under Agencies.
 * The server scopes this list to `kind: "discount"`, and the empty state says so,
 * because the single most likely mistake here is someone hunting for a referral code
 * and concluding it was deleted.
 *
 * The form takes a PERCENT. The column underneath is basis points (10% = 1000) and the
 * conversion happens once, server-side — a UI that submitted bps would put a 100x
 * pricing error one typo away.
 *
 * Codes are retired, never deleted: `PromoRedemption.promo_code` is `on_delete=PROTECT`,
 * so a code that has been used cannot be removed, and removing one that has would erase
 * the reason an old order was discounted.
 */
const STATUS_OPTIONS = FILTERS.map((f) => ({ value: f.value, label: f.label }));
const FILTER_KEYS = ["status"];
export function AdminPromoCodes() {
  const { page, limit, filters, setFilters, setPage, setLimit } = useListQuery({
    filterKeys: FILTER_KEYS,
  });
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const focusForm = useFocusOnReveal();
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [errors, setErrors] = useState({});
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("10");
  const [usageLimit, setUsageLimit] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchPromoCodes({ page, page_size: limit, isActive: filters.status || undefined })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page, limit, filters.status]);

  /* One effect keyed on the URL, so a navigation fires exactly one request. */
  useEffect(() => {
    load();
  }, [load]);

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    setNotice(null);
    setBusy("new");
    try {
      const created = await createPromoCode({
        code: code.trim(),
        percentOff: percent,
        usageLimit: usageLimit ? Number(usageLimit) : undefined,
      });
      setCode("");
      setUsageLimit("");
      setCreating(false);
      setNotice({
        tone: "success",
        text: `${created.code} created — ${created.percent_off}% off. Customers can use it now.`,
      });
      load();
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setErrors(fields);
      else setNotice({ tone: "error", text: err?.message || "We couldn't create that code." });
    } finally {
      setBusy(null);
    }
  }

  async function toggle(row) {
    setBusy(row.id);
    setNotice(null);
    try {
      const updated = await updatePromoCode(row.id, { isActive: !row.is_active });
      setNotice({
        tone: "success",
        text: updated.is_active
          ? `${row.code} is active again.`
          : `${row.code} retired — checkout will refuse it from now on.`,
      });
      load();
    } catch (err) {
      setNotice({ tone: "error", text: err?.message || "We couldn't update that code." });
    } finally {
      setBusy(null);
    }
  }

  const columns = [
    {
      key: "code",
      header: "Code",
      render: (row) => (
        <code className="font-display text-body-lg tracking-wide text-foreground">{row.code}</code>
      ),
    },
    {
      key: "percent_off",
      header: "Discount",
      render: (row) => <span className="font-medium text-foreground">{row.percent_off}% off</span>,
    },
    {
      key: "redemption_count",
      header: "Used",
      render: (row) =>
        row.usage_limit ? `${row.redemption_count} of ${row.usage_limit}` : `${row.redemption_count}`,
    },
    {
      key: "ends_at",
      header: "Expires",
      render: (row) => (row.ends_at ? new Date(row.ends_at).toLocaleDateString() : "No expiry"),
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) => <StatusBadge status={row.is_active ? "active" : "disabled"} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <button
          type="button"
          onClick={() => toggle(row)}
          disabled={busy === row.id}
          className="rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted disabled:opacity-60"
        >
          {busy === row.id ? "Saving…" : row.is_active ? "Retire" : "Reactivate"}
        </button>
      ),
    },
  ];

  return (
    <section>
      <AdminToolbar>
        <ToolbarSelect
          label="Filter promo codes by status"
          value={filters.status}
          onChange={(value) => setFilters({ status: value })}
          options={STATUS_OPTIONS}
        />
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="h-8 rounded-admin-sm border border-admin-border px-3 text-admin-label text-admin-text transition-colors hover:bg-admin-hover"
        >
          {creating ? "Cancel" : "New promo code"}
        </button>
      </AdminToolbar>

      {notice ? (
        <p
          role={notice.tone === "success" ? "status" : "alert"}
          className={cn(
            "mb-4 rounded-md p-3 text-body-sm",
            notice.tone === "success"
              ? "bg-success-text/10 text-success-text"
              : "bg-destructive/10 text-destructive-text",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      {creating ? (
        <form
          onSubmit={submit}
          ref={focusForm}
          tabIndex={-1}
          className="mb-6 rounded-lg border border-border bg-white p-5 sm:p-6"
          noValidate
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1">
              <span className="mb-1 block text-label-bold text-foreground">Code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                placeholder="SUMMER10"
                className="w-full rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm uppercase outline-none focus:border-primary"
              />
            </label>
            <label>
              <span className="mb-1 block text-label-bold text-foreground">Discount %</span>
              <input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                required
                className="w-32 rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm outline-none focus:border-primary"
              />
            </label>
            <label>
              <span className="mb-1 block text-label-bold text-foreground">
                Usage limit <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <input
                type="number"
                min="1"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                placeholder="Unlimited"
                className="w-36 rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              disabled={busy === "new"}
              className="inline-flex items-center gap-1.5 rounded-full bg-cta px-5 py-2.5 text-label-bold text-cta-foreground hover:brightness-110 disabled:opacity-60"
            >
              <Plus size={16} aria-hidden /> {busy === "new" ? "Creating…" : "Create code"}
            </button>
          </div>
          {/* Every field the server rejected, not just the one we happen to have an input
              for — a 400 whose reason is not rendered is a button that does nothing. */}
          {Object.entries(errors).map(([field, message]) => (
            <p key={field} role="alert" className="mt-3 text-body-sm text-destructive">
              {Array.isArray(message) ? message.join(" ") : message}
            </p>
          ))}
          <p className="mt-3 text-body-sm text-muted-foreground">
            The customer types this at checkout and pays that much less. For agency referral
            codes, which carry no discount, use Agencies instead.
          </p>
        </form>
      ) : null}

      <DataTable
        density="compact"
        caption="Discount promo codes"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        pageSize={limit}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        empty={{
          title: "No promo codes",
          body: "Create one to give customers a percentage off. Agency referral codes live under Agencies.",
        }}
      />
    </section>
  );
}
