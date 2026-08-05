import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TagInputProps {
  label: string;
  values: string[];
  onValuesChange: (values: string[]) => void;
}

export const TagInput = ({ label, values, onValuesChange }: TagInputProps) => {
  const [draft, setDraft] = useState("");

  const addTag = () => {
    const tag = draft.trim();
    if (tag && !values.includes(tag)) {
      onValuesChange([...values, tag]);
    }
    setDraft("");
  };

  const removeTag = (tag: string) => {
    onValuesChange(values.filter((existing) => existing !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder="Type a skill and press Enter"
        className="mt-1"
      />
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
                className="text-brand/70 hover:text-brand"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
