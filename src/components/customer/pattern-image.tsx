import Image from "next/image";
import { project } from "@/config/project";
import { customerMessages as m } from "@/i18n/customer-ro";

export function PatternImage({
  id,
  alt,
}: {
  id: string | null;
  alt: string | null;
}) {
  return (
    <div className="relative grid aspect-[3/2] overflow-hidden place-items-center bg-muted text-muted-foreground">
      {id ? (
        <Image
          src={project.routes.api + "/images/" + id}
          alt={alt ?? ""}
          fill
          unoptimized
          sizes="(max-width: 640px) 90vw, 45vw"
          className="object-cover"
        />
      ) : (
        <span>{m.imagePending}</span>
      )}
    </div>
  );
}
