import { customerMessages as m } from "@/i18n/customer-ro";
export default function Loading() {
  return (
    <p className="wrap py-12" role="status">
      {m.loading}
    </p>
  );
}
