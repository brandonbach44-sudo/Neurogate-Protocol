import type { DatasetDescription } from '../types/metadata';

interface DatasetDescriptionFormProps {
  description: DatasetDescription;
  onUpdate: (updated: DatasetDescription) => void;
  /** Whether this was auto-filled from an existing dataset_description.json */
  autoFilled: boolean;
}

/**
 * Dataset description form.
 *
 * Captures metadata for dataset_description.json (BIDS required).
 * Generated on first upload; pre-filled if existing JSON found.
 */
export default function DatasetDescriptionForm({
  description,
  onUpdate,
  autoFilled,
}: DatasetDescriptionFormProps) {

  const updateField = <K extends keyof DatasetDescription>(
    field: K,
    value: DatasetDescription[K]
  ) => {
    onUpdate({ ...description, [field]: value });
  };

  const updateAuthor = (index: number, value: string) => {
    const newAuthors = [...description.authors];
    newAuthors[index] = value;
    updateField('authors', newAuthors);
  };

  const addAuthor = () => {
    updateField('authors', [...description.authors, '']);
  };

  const removeAuthor = (index: number) => {
    if (description.authors.length <= 1) return;
    updateField('authors', description.authors.filter((_, i) => i !== index));
  };

  const updateFunding = (index: number, value: string) => {
    const newFunding = [...description.funding];
    newFunding[index] = value;
    updateField('funding', newFunding);
  };

  const addFunding = () => {
    updateField('funding', [...description.funding, '']);
  };

  const removeFunding = (index: number) => {
    if (description.funding.length <= 1) return;
    updateField('funding', description.funding.filter((_, i) => i !== index));
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-800">
            Dataset Description
          </span>
          <span className="text-xs text-gray-500 ml-2">
            dataset_description.json
          </span>
        </div>
        {autoFilled && (
          <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full">
            Auto-filled from existing file
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Study Name (required) */}
        <div>
          <label htmlFor="dd-study-name" className="block text-sm font-medium text-gray-700 mb-1">
            Study Name <span className="text-red-500">*</span>
          </label>
          <input
            id="dd-study-name"
            type="text"
            value={description.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="e.g., Multi-Site Neuroimaging Dataset"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2
              hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* BIDS Version (read-only) */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="dd-bids-version" className="block text-sm font-medium text-gray-700 mb-1">
              BIDS Version
            </label>
            <input
              id="dd-bids-version"
              type="text"
              value={description.bidsVersion}
              readOnly
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="dd-dataset-type" className="block text-sm font-medium text-gray-700 mb-1">
              Dataset Type
            </label>
            <input
              id="dd-dataset-type"
              type="text"
              value={description.datasetType}
              readOnly
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
            />
          </div>
        </div>

        {/* Authors (required, dynamic list) */}
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Authors <span className="text-red-500">*</span>
          </span>
          <div className="space-y-2">
            {description.authors.map((author, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={author}
                  onChange={(e) => updateAuthor(i, e.target.value)}
                  placeholder={`Author ${i + 1} name`}
                  aria-label={`Author ${i + 1} name`}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2
                    hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
                {description.authors.length > 1 && (
                  <button
                    onClick={() => removeAuthor(i)}
                    className="px-2 text-gray-500 hover:text-red-500 transition-colors"
                    title="Remove author"
                    aria-label={`Remove author ${i + 1}`}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addAuthor}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              + Add another author
            </button>
          </div>
        </div>

        {/* Acknowledgements (optional) */}
        <div>
          <label htmlFor="dd-acknowledgements" className="block text-sm font-medium text-gray-700 mb-1">
            Acknowledgements <span className="text-xs text-gray-500">(optional)</span>
          </label>
          <textarea
            id="dd-acknowledgements"
            value={description.acknowledgements}
            onChange={(e) => updateField('acknowledgements', e.target.value)}
            placeholder="e.g., We thank the participating sites for their contributions..."
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2
              hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
          />
        </div>

        {/* Funding (optional, dynamic list) */}
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Funding Sources <span className="text-xs text-gray-500">(optional)</span>
          </span>
          <div className="space-y-2">
            {description.funding.map((fund, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={fund}
                  onChange={(e) => updateFunding(i, e.target.value)}
                  placeholder={`Grant or funding source ${i + 1}`}
                  aria-label={`Funding source ${i + 1}`}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2
                    hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
                {description.funding.length > 1 && (
                  <button
                    onClick={() => removeFunding(i)}
                    className="px-2 text-gray-500 hover:text-red-500 transition-colors"
                    title="Remove funding source"
                    aria-label={`Remove funding source ${i + 1}`}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addFunding}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              + Add another funding source
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
