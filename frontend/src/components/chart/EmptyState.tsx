export default function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="chart-empty" role="status">
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}
