interface SectionHeadingProps {
  children: string;
}

export const SectionHeading = ({ children }: SectionHeadingProps) => (
  <h3 className="text-brand text-xs font-bold tracking-wider uppercase">{children}</h3>
);
