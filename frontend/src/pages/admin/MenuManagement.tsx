import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Archive,
  Check,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Star,
  Undo2,
} from "lucide-react";
import { categories as defaultCategories, calculateLargePrice } from "../../data/menu";
import { getMenuItemImage } from "../../data/menuImages";
import { useMenu } from "../../context/MenuContext";
import {
  AdminApiError,
  createAdminMenuProduct,
  fetchAdminMenu,
  updateAdminMenuArchive,
  updateAdminMenuProduct,
  updateAdminMenuStatus,
  uploadAdminMenuImage,
  type AdminMenuProduct,
  type AdminMenuProductInput,
} from "../../services/adminApi";

type Status = AdminMenuProduct["availabilityStatus"];
type FormState = AdminMenuProductInput;

const emptyForm: FormState = {
  name: "",
  description: "",
  category: "",
  image: null,
  availabilityStatus: "AVAILABLE",
  featured: false,
  regularPrice: 0,
  largePrice: null,
};

const statusLabels: Record<Status, string> = {
  AVAILABLE: "Available",
  SOLD_OUT: "Sold out",
  COMING_SOON: "Coming soon",
};

function suggestedLargePrice(regularPrice: number) {
  const suggestion = calculateLargePrice(regularPrice);
  return suggestion > 0 ? suggestion : null;
}

function requestMessage(error: unknown) {
  if (error instanceof AdminApiError || error instanceof Error) return error.message;
  return "The menu change could not be saved. Please try again.";
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unable to read the selected image."));
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });
}

function productInput(product: AdminMenuProduct): FormState {
  return {
    name: product.name,
    description: product.description ?? "",
    category: product.category,
    image: product.image,
    availabilityStatus: product.availabilityStatus,
    featured: product.featured,
    regularPrice: product.variants.find((variant) => variant.size === "Regular")?.price ?? 0,
    largePrice: product.variants.find((variant) => variant.size === "Large")?.price ?? null,
  };
}

export default function MenuManagement() {
  const { refreshMenu } = useMenu();
  const [products, setProducts] = useState<AdminMenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminMenuProduct | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [largePriceManual, setLargePriceManual] = useState(false);
  const [largePriceEnabled, setLargePriceEnabled] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadProducts = useCallback(async (includeArchived: boolean) => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await fetchAdminMenu(includeArchived));
    } catch (loadError) {
      setError(requestMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadProducts(false), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadProducts]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const categories = useMemo(
    () => [...new Set([...defaultCategories, ...products.map((product) => product.category)])].sort(),
    [products],
  );
  const visibleProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(normalizedSearch);
      const matchesCategory = categoryFilter === "ALL" || product.category === categoryFilter;
      const matchesStatus = statusFilter === "ALL" || product.availabilityStatus === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, search, categoryFilter, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, category: categories[0] ?? "" });
    setLargePriceManual(false);
    setLargePriceEnabled(true);
    setImageFile(null);
    setImagePreview(null);
    setError(null);
    setNotice(null);
    setEditorOpen(true);
  };

  const openEdit = (product: AdminMenuProduct) => {
    setEditing(product);
    setForm(productInput(product));
    setLargePriceManual(product.variants.some(
      (variant) => variant.size === "Large" &&
        variant.price !== calculateLargePrice(product.variants.find((size) => size.size === "Regular")?.price ?? 0),
    ));
    setLargePriceEnabled(product.variants.some((variant) => variant.size === "Large"));
    setImageFile(null);
    setImagePreview(null);
    setError(null);
    setNotice(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!Number.isSafeInteger(form.regularPrice) || form.regularPrice <= 0) {
      setError("Regular price must be a positive whole number.");
      return;
    }
    const largePrice = !largePriceEnabled
      ? null
      : largePriceManual ? form.largePrice : suggestedLargePrice(form.regularPrice);
    if (largePrice !== null && (!Number.isSafeInteger(largePrice) || largePrice <= 0)) {
      setError("Large price must be a positive whole number or left blank.");
      return;
    }
    if (largePriceEnabled && largePrice === null) {
      setError("Enter a positive Large price or turn off the Large size.");
      return;
    }
    setSaving(true);
    setError(null);
    let productSaved = false;
    try {
      const input = { ...form, largePrice };
      let productId: string;
      if (editing) {
        await updateAdminMenuProduct(editing.id, input);
        productId = editing.id;
      } else {
        const createdProduct = await createAdminMenuProduct(input);
        productId = createdProduct.id;
        setEditing(createdProduct);
      }
      productSaved = true;
      if (imageFile) {
        await uploadAdminMenuImage(productId, await readDataUrl(imageFile));
      }
      setNotice(editing ? "Product changes saved." : "Product added to the menu.");
      setEditorOpen(false);
      setImageFile(null);
      setImagePreview(null);
      await loadProducts(showArchived);
      await refreshMenu();
    } catch (saveError) {
      const message = requestMessage(saveError);
      if (productSaved) {
        await loadProducts(showArchived);
        await refreshMenu();
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (product: AdminMenuProduct, availabilityStatus: Status) => {
    if (product.availabilityStatus === availabilityStatus) return;
    if (!window.confirm(`Change ${product.name} to ${statusLabels[availabilityStatus]}?`)) return;
    setBusyProductId(product.id);
    setError(null);
    try {
      const updated = await updateAdminMenuStatus(product.id, availabilityStatus);
      setProducts((current) => current
        .map((item) => item.id === product.id ? updated : item)
        .filter((item) => showArchived || !item.archived));
      setNotice(`${product.name} is now ${statusLabels[availabilityStatus].toLowerCase()}.`);
      await refreshMenu();
    } catch (statusError) {
      const message = requestMessage(statusError);
      await loadProducts(showArchived);
      setError(message);
    } finally {
      setBusyProductId(null);
    }
  };

  const changeArchive = async (product: AdminMenuProduct) => {
    const archived = !product.archived;
    if (archived && !window.confirm(`Archive ${product.name}? It will disappear from the customer menu, but its order history will be kept.`)) return;
    setBusyProductId(product.id);
    setError(null);
    try {
      const updated = await updateAdminMenuArchive(product.id, archived);
      setProducts((current) => current
        .map((item) => item.id === product.id ? updated : item)
        .filter((item) => showArchived || !item.archived));
      setNotice(archived ? `${product.name} archived.` : `${product.name} restored.`);
      await refreshMenu();
    } catch (archiveError) {
      const message = requestMessage(archiveError);
      await loadProducts(showArchived);
      setError(message);
    } finally {
      setBusyProductId(null);
    }
  };

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-700">Restaurant tools</p>
          <h1 className="mt-1 text-3xl font-bold text-[#354632]">Menu Management</h1>
          <p className="mt-2 text-sm text-gray-600">Update products and availability shown to customers.</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#354632] px-5 font-semibold text-white hover:bg-[#263524]">
          <Plus size={18} /> Add New Item
        </button>
      </header>

      {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div className="grid gap-3 rounded-2xl border border-[#e7e4d8] bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Search product name</span>
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" className="min-h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 outline-none focus:border-[#354632]" />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <span className="shrink-0">Category</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2">
            <option value="ALL">All categories</option>
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <span className="shrink-0">Availability</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2">
            <option value="ALL">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={showArchived} onChange={(event) => {
            setShowArchived(event.target.checked);
            void loadProducts(event.target.checked);
          }} className="h-4 w-4 accent-[#354632]" />
          Include archived items
        </label>
      </div>

      {loading ? (
        <p role="status" className="rounded-2xl bg-white p-10 text-center text-gray-600">Loading menu items…</p>
      ) : visibleProducts.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-gray-600">
          {error ? "Menu items could not be loaded." : "No products match these filters."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProducts.map((product) => {
            const regular = product.variants.find((variant) => variant.size === "Regular")?.price;
            const large = product.variants.find((variant) => variant.size === "Large")?.price;
            const busy = busyProductId === product.id;
            const productImage = product.image ?? getMenuItemImage({
              id: product.id,
              name: product.name,
              category: product.category,
              variants: [],
              available: product.availabilityStatus === "AVAILABLE",
            });
            return (
              <article key={product.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${product.archived ? "border-gray-300 opacity-75" : "border-[#e7e4d8]"}`}>
                <div className="relative flex aspect-[16/8] items-center justify-center bg-[#e9eddf]">
                  {productImage ? <img src={productImage} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={32} className="text-[#71806d]" />}
                  <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold ${product.archived ? "bg-gray-700 text-white" : product.availabilityStatus === "AVAILABLE" ? "bg-green-100 text-green-900" : product.availabilityStatus === "SOLD_OUT" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                    {product.archived ? "Archived" : statusLabels[product.availabilityStatus]}
                  </span>
                  {product.featured && <span className="absolute right-3 top-3 rounded-full bg-[#fff7e9] px-3 py-1 text-xs font-semibold text-[#8d562e]"><Star size={13} className="mr-1 inline" />Featured</span>}
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-[#354632]">{product.name}</h2>
                      <p className="text-sm text-gray-500">{product.category}</p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-semibold text-[#354632]">
                      {regular !== undefined ? `₹${regular}` : "—"}
                      {large !== undefined && <span className="block text-xs font-normal text-gray-500">Large ₹{large}</span>}
                    </p>
                  </div>
                  {product.description && <p className="line-clamp-2 text-sm text-gray-600">{product.description}</p>}
                  {!product.archived && (
                    <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                      {(["AVAILABLE", "SOLD_OUT", "COMING_SOON"] as const).map((status) => (
                        <button key={status} type="button" disabled={busy} onClick={() => void changeStatus(product, status)} className={`min-h-9 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-50 ${product.availabilityStatus === status ? "border-[#354632] bg-[#edf1e6] text-[#354632]" : "border-gray-200 text-gray-600 hover:border-[#354632]"}`}>
                          {busy && product.availabilityStatus !== status ? <LoaderCircle className="inline animate-spin" size={13} /> : product.availabilityStatus === status ? <Check className="mr-1 inline" size={13} /> : null}
                          {statusLabels[status]}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between gap-2 border-t border-gray-100 pt-3">
                    {!product.archived && <button type="button" onClick={() => openEdit(product)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[#354632] hover:bg-[#f3f5ef]"><Pencil size={15} /> Edit</button>}
                    <button type="button" disabled={busy} onClick={() => void changeArchive(product)} className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                      {busy ? <LoaderCircle size={15} className="animate-spin" /> : product.archived ? <Undo2 size={15} /> : <Archive size={15} />}
                      {product.archived ? "Restore" : "Archive"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeEditor();
        }}>
          <form role="dialog" aria-modal="true" aria-labelledby="menu-editor-title" onSubmit={(event) => void handleSave(event)} className="max-h-[95vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="menu-editor-title" className="text-2xl font-bold text-[#354632]">{editing ? "Edit menu item" : "Add a menu item"}</h2>
                <p className="mt-1 text-sm text-gray-500">Enter the details customers will see.</p>
              </div>
              <button type="button" disabled={saving} onClick={closeEditor} className="rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100">Close</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-gray-700 sm:col-span-2">Product name *
                <input required maxLength={120} value={form.name} onChange={(event) => updateForm("name", event.target.value)} className="min-h-11 w-full rounded-lg border border-gray-300 px-3" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Category *
                <select required value={form.category} onChange={(event) => updateForm("category", event.target.value)} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
                  <option value="" disabled>Select a category</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Availability
                <select value={form.availabilityStatus} onChange={(event) => updateForm("availabilityStatus", event.target.value as Status)} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700 sm:col-span-2">Description
                <textarea rows={3} maxLength={1000} value={form.description} onChange={(event) => updateForm("description", event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Regular price (₹) *
                <input type="number" min="1" step="1" required value={form.regularPrice || ""} onChange={(event) => {
                  const regularPrice = Number(event.target.value);
                  setForm((current) => ({
                    ...current,
                    regularPrice,
                    largePrice: largePriceManual ? current.largePrice : suggestedLargePrice(regularPrice),
                  }));
                }} className="min-h-11 w-full rounded-lg border border-gray-300 px-3" />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Large price (₹), optional
                <input type="number" min="1" step="1" required={largePriceEnabled} disabled={!largePriceEnabled} value={form.largePrice ?? ""} onChange={(event) => {
                  const value = event.target.value === "" ? null : Number(event.target.value);
                  setLargePriceManual(true);
                  updateForm("largePrice", value);
                }} className="min-h-11 w-full rounded-lg border border-gray-300 px-3" />
                <label className="mt-2 flex items-center gap-2 text-xs font-normal">
                  <input type="checkbox" checked={largePriceEnabled} onChange={(event) => {
                    const enabled = event.target.checked;
                    setLargePriceEnabled(enabled);
                    if (enabled) {
                      setLargePriceManual(false);
                      updateForm("largePrice", suggestedLargePrice(form.regularPrice));
                    }
                  }} className="h-4 w-4 accent-[#354632]" />
                  Offer a Large size
                </label>
                <button type="button" disabled={!largePriceEnabled} onClick={() => {
                  setLargePriceManual(false);
                  updateForm("largePrice", suggestedLargePrice(form.regularPrice));
                }} className="text-xs font-semibold text-[#354632] underline disabled:text-gray-400">
                  {suggestedLargePrice(form.regularPrice) === null
                    ? "Formula is below ₹1; enter a price manually"
                    : `Use suggestion: ₹${suggestedLargePrice(form.regularPrice)}`}
                </button>
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-gray-700 sm:col-span-2">
                <input type="checkbox" checked={form.featured} onChange={(event) => updateForm("featured", event.target.checked)} className="h-4 w-4 accent-[#354632]" />
                Feature this item on the menu
              </label>
              <div className="space-y-2 sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Product image (JPEG, PNG, or WebP; up to 4 MB)</label>
                {(imagePreview || form.image) && <img src={imagePreview ?? form.image ?? undefined} alt="Product preview" className="h-36 w-full rounded-xl bg-[#e9eddf] object-cover" />}
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024)) {
                    setError("Choose a JPEG, PNG, or WebP image no larger than 4 MB.");
                    event.target.value = "";
                    setImageFile(null);
                    setImagePreview(null);
                    return;
                  }
                  setError(null);
                  setImageFile(file);
                  setImagePreview(file ? URL.createObjectURL(file) : null);
                }} className="block w-full text-sm text-gray-600 file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-[#edf1e6] file:px-4 file:font-semibold file:text-[#354632]" />
                {form.image && !imageFile && <button type="button" onClick={() => updateForm("image", null)} className="text-xs font-semibold text-red-700 underline">Remove current image</button>}
              </div>
            </div>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <div className="flex flex-col-reverse justify-end gap-2 border-t border-gray-100 pt-4 sm:flex-row">
              <button type="button" disabled={saving} onClick={closeEditor} className="min-h-11 rounded-xl border border-gray-300 px-5 font-semibold text-gray-700">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#354632] px-5 font-semibold text-white disabled:opacity-60">
                {saving ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />}
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Item"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
