"use client";
import CollectionEditor, { FieldDef } from "@/components/admin/CollectionEditor";

const FIELDS: FieldDef[] = [
  { name: "author_name", label: "Name" },
  { name: "position", label: "Position" },
  { name: "company", label: "Company" },
  { name: "linkedin_url", label: "LinkedIn URL" },
  { name: "avatar_url", label: "Profile photo", type: "image" },
  { name: "quote", label: "Recommendation text", type: "textarea" },
  { name: "stars", label: "Stars (1-5)", type: "number" },
  { name: "order", label: "Order", type: "number" },
];

export default function RecommendationsAdmin() {
  return (
    <CollectionEditor
      title="Recommendations"
      path="/recommendations"
      fields={FIELDS}
      itemLabel={(i) => `${i.author_name}${i.company ? " · " + i.company : ""}`}
    />
  );
}
