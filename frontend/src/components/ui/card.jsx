import { cn } from "@/lib/cn";

export function Card({ className, ...props }) {
  return (
    <div
      className={cn("rounded-card border border-border bg-card text-card-foreground", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }) {
  return <div className={cn("p-6", className)} {...props} />;
}
