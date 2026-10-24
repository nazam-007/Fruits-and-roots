
type Variant = {
  size: string;
  price: number;
};

type SizeSelectorProps = {
  variants: Variant[];
  selectedSize: string;
  onSelect: (size: string) => void;
};

export default function SizeSelector({
  variants,
  selectedSize,
  onSelect,
}: SizeSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-[#354632]">
        Select Size
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {variants.map((variant) => (
          <button
            key={variant.size}
            type="button"
            onClick={() => onSelect(variant.size)}
            className={`rounded-xl border-2 p-4 text-left transition ${
              selectedSize === variant.size
                ? "border-[#354632] bg-[#E8EDDF]"
                : "border-gray-200 bg-white"
            }`}
          >
            <p className="font-semibold">{variant.size}</p>
            <p className="mt-1 text-sm">₹{variant.price}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
