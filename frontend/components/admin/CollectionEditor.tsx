"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createItem, deleteItem, listCollection, updateItem } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { ImageInput } from "@/components/ui/ImageInput";

export type FieldType = "text" | "textarea" | "number" | "checkbox" | "image" | "list";

export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  placeholder?: string;
}

type Row = Record<string, unknown>;

function toForm(fields: FieldDef[], item: Row): Row {
  const f: Row = {};
  for (const fd of fields) {
    const v = item[fd.name];
    if (fd.type === "list") f[fd.name] = Array.isArray(v) ? (v as string[]).join("\n") : "";
    else if (fd.type === "checkbox") f[fd.name] = !!v;
    else f[fd.name] = v ?? "";
  }
  return f;
}

function toPayload(fields: FieldDef[], form: Row): Row {
  const p: Row = {};
  for (const fd of fields) {
    const v = form[fd.name];
    if (fd.type === "list") {
      p[fd.name] = String(v || "")
        .split(/[\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (fd.type === "number") {
      p[fd.name] = v === "" || v == null ? 0 : Number(v);
    } else {
      p[fd.name] = v;
    }
  }
  return p;
}

function FieldInput({
  fd,
  value,
  onChange,
}: {
  fd: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const cls = "w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm";
  if (fd.type === "image")
    return <ImageInput value={String(value || "")} onChange={onChange} label={fd.label} />;
  if (fd.type === "checkbox")
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {fd.label}
      </label>
    );
  return (
    <label className="block">
      <span className="text-xs text-muted">{fd.label}</span>
      {fd.type === "textarea" || fd.type === "list" ? (
        <textarea
          rows={fd.type === "list" ? 3 : 3}
          value={String(value ?? "")}
          placeholder={fd.placeholder || (fd.type === "list" ? "one per line" : "")}
          onChange={(e) => onChange(e.target.value)}
          className={cls + " mt-1"}
        />
      ) : (
        <input
          type={fd.type === "number" ? "number" : "text"}
          value={String(value ?? "")}
          placeholder={fd.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cls + " mt-1"}
        />
      )}
    </label>
  );
}

export default function CollectionEditor({
  title,
  path,
  fields,
  itemLabel,
}: {
  title: string;
  path: string;
  fields: FieldDef[];
  itemLabel: (item: Row) => string;
}) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: [path], queryFn: () => listCollection(path) });
  const items = (data?.items as Row[]) ?? [];

  const [draft, setDraft] = useState<Row>({});
  const [editing, setEditing] = useState<Record<number, Row>>({});

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [path] });
    qc.invalidateQueries({ queryKey: ["bootstrap"] });
  };

  const create = useMutation({
    mutationFn: () => createItem(token, path, toPayload(fields, draft)),
    onSuccess: () => {
      setDraft({});
      refresh();
    },
  });
  const save = useMutation({
    mutationFn: ({ id, form }: { id: number; form: Row }) =>
      updateItem(token, path, id, toPayload(fields, form)),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteItem(token, path, id),
    onSuccess: refresh,
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading font-bold text-2xl mb-6">{title}</h1>

      {/* add new */}
      <div className="rounded-theme bg-surface border border-white/10 p-4 mb-8">
        <h2 className="font-semibold mb-3">Add</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {fields.map((fd) => (
            <div key={fd.name} className={fd.type === "textarea" || fd.type === "list" ? "sm:col-span-2" : ""}>
              <FieldInput
                fd={fd}
                value={draft[fd.name]}
                onChange={(v) => setDraft({ ...draft, [fd.name]: v })}
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="mt-3 rounded-theme bg-primary text-white px-4 py-2 disabled:opacity-50"
        >
          {create.isPending ? "Adding…" : "Add"}
        </button>
      </div>

      {/* list */}
      <div className="space-y-3">
        {items.map((item) => {
          const id = item.id as number;
          const isEditing = id in editing;
          return (
            <div key={id} className="rounded-theme bg-surface border border-white/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{itemLabel(item)}</span>
                <div className="flex gap-2 text-sm">
                  <button
                    onClick={() =>
                      setEditing((e) => {
                        const n = { ...e };
                        if (isEditing) delete n[id];
                        else n[id] = toForm(fields, item);
                        return n;
                      })
                    }
                    className="rounded-theme border border-white/15 px-3 py-1"
                  >
                    {isEditing ? "Close" : "Edit"}
                  </button>
                  <button
                    onClick={() => remove.mutate(id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {isEditing && (
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                  {fields.map((fd) => (
                    <div key={fd.name} className={fd.type === "textarea" || fd.type === "list" ? "sm:col-span-2" : ""}>
                      <FieldInput
                        fd={fd}
                        value={editing[id][fd.name]}
                        onChange={(v) =>
                          setEditing((e) => ({ ...e, [id]: { ...e[id], [fd.name]: v } }))
                        }
                      />
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <button
                      onClick={() =>
                        save.mutate(
                          { id, form: editing[id] },
                          { onSuccess: () => setEditing((e) => { const n = { ...e }; delete n[id]; return n; }) },
                        )
                      }
                      className="rounded-theme bg-primary text-white px-4 py-2 text-sm"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && <p className="text-muted text-sm">Nothing yet — add above.</p>}
      </div>
    </div>
  );
}
