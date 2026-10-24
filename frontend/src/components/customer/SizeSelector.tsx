import type { MenuVariant } from "../../data/menu";

type SizeSelectorProps = {
  variants: MenuVariant[];
  selectedSize: MenuVariant["size"];
  onSelect: (size: MenuVariant["size"]) => void;
};

export default function SizeSelector({
  variants,
  selectedSize,
  onSelect,
}: SizeSelectorProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-[#253b2a]">
        Choose your size
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {variants.map((variant) => {
          const isSelected = selectedSize === variant.size;

          return (
            <button
              key={variant.size}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(variant.size)}
              className={`min-h-[76px] rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2 ${
                isSelected
                  ? "border-[#31573a] bg-[#edf1e6] shadow-[0_6px_20px_-14px_rgba(49,87,58,0.65)]"
                  : "border-[#e5e2d6] bg-white hover:border-[#a9b49e] hover:bg-[#fbfbf7]"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#253b2a]">
                  {variant.size}
                </span>
                {isSelected && (
                  <span className="h-2 w-2 rounded-full bg-[#31573a]" />
                )}
              </span>
              <span className="mt-1 block text-sm font-medium text-[#697363]">
                ₹{variant.price}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
