"use client";
import CollectionEditor, { FieldDef } from "@/components/admin/CollectionEditor";

const FIELDS: FieldDef[] = [
  { name: "degree", label: "Degree" },
  { name: "institution", label: "Institution" },
  { name: "field_of_study", label: "Field of study" },
  { name: "start_date", label: "Start date" },
  { name: "end_date", label: "End date" },
  { name: "description", label: "Description", type: "textarea" },
  { name: "order", label: "Order", type: "number" },
];

export default function EducationAdmin() {
  return (
    <CollectionEditor
      title="Education"
      path="/education"
      fields={FIELDS}
      itemLabel={(i) => `${i.degree}${i.institution ? " · " + i.institution : ""}`}
    />
  );
}
