import { useRef, useState } from "react";
import { ComboBox } from "./ComboBox";
import { api } from "../api";

interface HashtagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

/** Multi-select hashtag editor: suggests tags already used by anyone (with a cross-dashboard usage count), or lets the user type a new one. */
export function HashtagInput({ tags, onChange }: HashtagInputProps) {
  const [suggestions, setSuggestions] = useState<{ id: string; label: string }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim().replace(/^#/, "");
    if (!trimmed) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(() => {
      api(`/tags/suggest?q=${encodeURIComponent(trimmed)}`)
        .then((results: any[]) => setSuggestions(results.map((r) => ({ id: r.tag, label: `#${r.tag} (${r.count})` }))))
        .catch(() => setSuggestions([]));
    }, 250);
  }

  const selectedOptions = tags.map((t) => ({ id: t, label: `#${t}` }));
  const options = [...selectedOptions, ...suggestions.filter((s) => !tags.includes(s.id))];

  function addTag(label: string) {
    const cleaned = label.trim().replace(/^#/, "").toLowerCase();
    if (cleaned && !tags.includes(cleaned)) onChange([...tags, cleaned]);
  }

  return (
    <ComboBox
      options={options}
      selectedIds={tags}
      onChange={onChange}
      onQueryChange={handleQueryChange}
      placeholder="Hashtags — type to search or add new"
      multi
      allowCreate
      onCreateOption={addTag}
      createOptionLabel="as new hashtag"
    />
  );
}
