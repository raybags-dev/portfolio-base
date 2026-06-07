"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSkill,
  deleteSkill,
  listSkills,
  updateSkill,
} from "@/lib/api";
import { useAuth } from "@/lib/store";

export default function SkillsPage() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["skills"], queryFn: listSkills });
  const skills = data?.items ?? [];

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [proficiency, setProficiency] = useState(80);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["skills"] });
    qc.invalidateQueries({ queryKey: ["bootstrap"] });
  };

  const create = useMutation({
    mutationFn: () => createSkill(token, { name, category, proficiency }),
    onSuccess: () => {
      setName("");
      setCategory("");
      setProficiency(80);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteSkill(token, id),
    onSuccess: refresh,
  });
  const bump = useMutation({
    mutationFn: ({ id, value }: { id: number; value: number }) =>
      updateSkill(token, id, { proficiency: value }),
    onSuccess: refresh,
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading font-bold text-2xl mb-6">Skills</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="flex flex-wrap gap-2 items-end mb-8 rounded-theme bg-surface border border-white/10 p-4"
      >
        <label className="flex-1 min-w-[140px]">
          <span className="text-xs text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2"
          />
        </label>
        <label className="flex-1 min-w-[140px]">
          <span className="text-xs text-muted">Category</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2"
          />
        </label>
        <label className="w-28">
          <span className="text-xs text-muted">Proficiency</span>
          <input
            type="number"
            min={0}
            max={100}
            value={proficiency}
            onChange={(e) => setProficiency(Number(e.target.value))}
            className="w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-theme bg-primary text-white px-4 py-2 font-medium hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <div className="space-y-2">
        {skills.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 rounded-theme bg-surface border border-white/10 px-4 py-3"
          >
            <div className="flex-1">
              <span className="font-medium">{s.name}</span>{" "}
              {s.category && <span className="text-muted text-sm">· {s.category}</span>}
            </div>
            <input
              type="number"
              min={0}
              max={100}
              defaultValue={s.proficiency}
              onBlur={(e) => bump.mutate({ id: s.id, value: Number(e.target.value) })}
              className="w-20 rounded-theme bg-bg border border-white/15 px-2 py-1 text-sm"
            />
            <button
              onClick={() => remove.mutate(s.id)}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Delete
            </button>
          </div>
        ))}
        {skills.length === 0 && (
          <p className="text-muted text-sm">No skills yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
