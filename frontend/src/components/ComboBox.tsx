import { useEffect, useRef, useState } from "react";

interface Option {
  id: string;
  label: string;
}

interface ComboBoxProps {
  options: Option[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  multi?: boolean;
}

export function ComboBox({ options, selectedIds, onChange, placeholder, multi = false }: ComboBoxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selectedOptions = selectedIds.map((id) => options.find((o) => o.id === id)).filter(Boolean) as Option[];

  function select(opt: Option) {
    if (multi) {
      if (!selectedIds.includes(opt.id)) {
        onChange([...selectedIds, opt.id]);
      }
      setQuery("");
    } else {
      onChange([opt.id]);
      setQuery(opt.label);
      setOpen(false);
    }
  }

  function remove(id: string) {
    onChange(selectedIds.filter((s) => s !== id));
  }

  function handleInputChange(val: string) {
    setQuery(val);
    setOpen(true);
    if (!multi && val === "") {
      onChange([]);
    }
  }

  // For single-select: show the selected label in the input when not focused
  const inputValue = !multi && !open && selectedOptions.length > 0 ? selectedOptions[0].label : query;

  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      {/* Multi-select chips */}
      {multi && selectedOptions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
          {selectedOptions.map((opt) => (
            <span key={opt.id} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "var(--accent, #2563eb)", color: "#fff",
              borderRadius: 4, padding: "2px 6px", fontSize: 12, fontWeight: 500
            }}>
              {opt.label}
              <span
                onMouseDown={(e) => { e.preventDefault(); remove(opt.id); }}
                style={{ cursor: "pointer", lineHeight: 1, fontSize: 14 }}
              >×</span>
            </span>
          ))}
        </div>
      )}
      <input
        className="input"
        value={inputValue}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => handleInputChange(e.target.value)}
        autoComplete="off"
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "var(--surface, #fff)", border: "1px solid var(--border, #d1d5db)",
          borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          maxHeight: 200, overflowY: "auto", marginTop: 2
        }}>
          {filtered.map((opt) => {
            const isSelected = selectedIds.includes(opt.id);
            return (
              <div
                key={opt.id}
                onMouseDown={(e) => { e.preventDefault(); select(opt); }}
                style={{
                  padding: "8px 12px", fontSize: 13, cursor: "pointer",
                  background: isSelected ? "var(--accent-muted, #eff6ff)" : undefined,
                  fontWeight: isSelected ? 600 : 400
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover, #f3f4f6)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? "var(--accent-muted, #eff6ff)" : "")}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
