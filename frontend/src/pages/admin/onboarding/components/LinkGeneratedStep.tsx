import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiNote } from "./ApiNote";

interface LinkGeneratedStepProps {
  url: string;
  onCreateAnother: () => void;
}

export const LinkGeneratedStep = ({ url, onCreateAnother }: LinkGeneratedStepProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Shareable Link Ready</h2>
        <p className="text-gray-600">Send this link to the prospect so they can complete the form themselves.</p>
      </div>

      <div className="flex gap-2">
        <Input value={url} readOnly className="font-mono text-sm" />
        <Button type="button" onClick={handleCopy} variant="outline">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <ApiNote variant="info">
        The link expires after one submission. The company and member profiles land in the review
        queue once they finish the form — nothing is pushed to PeopleVine until an admin approves it.
      </ApiNote>

      <Button variant="outline" onClick={onCreateAnother}>
        Generate another link
      </Button>
    </div>
  );
};
