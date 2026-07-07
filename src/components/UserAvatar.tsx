import { getInitials } from "@/lib/utils";

const COLORS = [
  "bg-o2-green/20 text-o2-green",
  "bg-blue-500/20 text-blue-400",
  "bg-purple-500/20 text-purple-400",
  "bg-orange-500/20 text-orange-400",
];

export function UserAvatar({
  name,
  image,
  size = "md",
  index = 0,
}: {
  name?: string | null;
  image?: string | null;
  size?: "sm" | "md" | "lg";
  index?: number;
}) {
  const sz = { sm: "w-7 h-7 text-xs", md: "w-9 h-9 text-sm", lg: "w-11 h-11 text-base" };
  const color = COLORS[index % COLORS.length];

  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt={name || ""} className={`${sz[size]} rounded-full object-cover`} />
    );
  }

  return (
    <div className={`${sz[size]} ${color} rounded-full flex items-center justify-center font-bold flex-shrink-0`}>
      {getInitials(name)}
    </div>
  );
}
