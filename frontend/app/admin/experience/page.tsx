"use client";
import CollectionEditor, { FieldDef } from "@/components/admin/CollectionEditor";

const FIELDS: FieldDef[] = [
  { name: "role", label: "Role" },
  { name: "company", label: "Company" },
  { name: "location", label: "Location" },
  { name: "start_date", label: "Start date", placeholder: "2022" },
  { name: "end_date", label: "End date", placeholder: "2024" },
  { name: "is_current", label: "Current role", type: "checkbox" },
  { name: "description", label: "Description", type: "textarea" },
  { name: "highlights", label: "Highlights (one per line)", type: "list" },
  { name: "order", label: "Order", type: "number" },
];

export default function ExperienceAdmin() {
  return (
    <CollectionEditor
      title="Experience"
      path="/experiences"
      fields={FIELDS}
      itemLabel={(i) => `${i.role}${i.company ? " · " + i.company : ""}`}
    />
  );
}
