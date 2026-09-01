export default function Toast({ message, show }: { message: string; show: boolean }) {
  return <div className={`toast${show ? " show" : ""}`}>{message}</div>;
}
