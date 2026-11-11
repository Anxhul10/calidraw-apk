export default function ActionRow({ icon: Icon, label, onClick, trailing }) {
  return (
    <button className="explorer-action" type="button" onClick={onClick}>
      <Icon size={16} strokeWidth={1.8} />
      <span>{label}</span>
      {trailing ? <span className="explorer-action-trailing">{trailing}</span> : null}
    </button>
  );
}
