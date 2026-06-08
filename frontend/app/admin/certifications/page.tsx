"use client";
import CollectionEditor, { FieldDef } from "@/components/admin/CollectionEditor";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Name" },
  { name: "issuer", label: "Issuer" },
  { name: "issue_date", label: "Issue date" },
  { name: "credential_url", label: "Credential URL" },
  { name: "image_url", label: "Badge image", type: "image" },
  { name: "order", label: "Order", type: "number" },
];

export default function CertificationsAdmin() {
  return (
    <CollectionEditor
      title="Certifications"
      path="/certifications"
      fields={FIELDS}
      itemLabel={(i) => String(i.name)}
    />
  );
}
