import type { ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, Italic, List, ListOrdered, Link as LinkIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  id?: string;
  label?: string;
  content: string;
  onChange: (html: string) => void;
}

export const RichTextEditor = ({ id, label, content, onChange }: RichTextEditorProps) => {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        id: id ?? "",
        class: "min-h-[220px] px-3 py-2 text-sm focus:outline-none prose prose-sm max-w-none",
      },
    },
  });

  if (!editor) return null;

  const toolbarButton = (active: boolean, onClick: () => void, icon: ReactNode, labelText: string) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={labelText}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100",
        active && "bg-gray-200"
      )}
    >
      {icon}
    </button>
  );

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", previousUrl ?? "");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="mt-1 rounded-md border">
        <div className="flex items-center gap-1 border-b px-2 py-1">
          {toolbarButton(
            editor.isActive("bold"),
            () => editor.chain().focus().toggleBold().run(),
            <Bold className="h-4 w-4" />,
            "Bold"
          )}
          {toolbarButton(
            editor.isActive("italic"),
            () => editor.chain().focus().toggleItalic().run(),
            <Italic className="h-4 w-4" />,
            "Italic"
          )}
          {toolbarButton(
            editor.isActive("bulletList"),
            () => editor.chain().focus().toggleBulletList().run(),
            <List className="h-4 w-4" />,
            "Bullet list"
          )}
          {toolbarButton(
            editor.isActive("orderedList"),
            () => editor.chain().focus().toggleOrderedList().run(),
            <ListOrdered className="h-4 w-4" />,
            "Numbered list"
          )}
          {toolbarButton(editor.isActive("link"), setLink, <LinkIcon className="h-4 w-4" />, "Link")}
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
