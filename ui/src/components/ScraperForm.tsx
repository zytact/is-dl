import { Play } from 'lucide-react';
import { useState } from 'react';

interface ScraperFormProps {
  onStart: (data: any) => void;
  isScraping: boolean;
}

export function ScraperForm({ onStart, isScraping }: ScraperFormProps) {
  const [formData, setFormData] = useState({
    keywords: '',
    location: '',
    limit: 50,
    experienceLevel: '',
    jobType: '',
    remoteOnly: false,
    postedWithin: '',
    headless: true,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    const val =
      type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStart(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex justify-between border-b border-brand-border pb-2">
        <h3 className="text-brand-cyan tracking-widest font-bold uppercase">
          TARGET_PARAMS
        </h3>
      </div>

      <div className="flex flex-col gap-1 relative group">
        <label
          htmlFor="keywords"
          className="text-xs uppercase text-brand-muted tracking-widest bg-brand-dark px-1 absolute -top-2 left-2 group-focus-within:text-brand-cyan transition-colors z-10"
        >
          KEYWORDS (REQ)
        </label>
        <input
          id="keywords"
          name="keywords"
          type="text"
          required
          placeholder="e.g. Software Engineer Intern"
          className="brutal-input py-3 mt-1"
          value={formData.keywords}
          onChange={handleChange}
          disabled={isScraping}
        />
      </div>

      <div className="flex flex-col gap-1 relative group">
        <label
          htmlFor="location"
          className="text-xs uppercase text-brand-muted tracking-widest bg-brand-dark px-1 absolute -top-2 left-2 group-focus-within:text-brand-cyan transition-colors z-10"
        >
          LOCATION
        </label>
        <input
          id="location"
          name="location"
          type="text"
          placeholder="e.g. San Francisco, CA"
          className="brutal-input py-3 mt-1"
          value={formData.location}
          onChange={handleChange}
          disabled={isScraping}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1 relative group">
          <label
            htmlFor="limit"
            className="text-xs uppercase text-brand-muted tracking-widest bg-brand-dark px-1 absolute -top-2 left-2 group-focus-within:text-brand-cyan transition-colors z-10"
          >
            MAX_YIELD
          </label>
          <input
            id="limit"
            name="limit"
            type="number"
            min="1"
            className="brutal-input py-3 mt-1"
            value={formData.limit}
            onChange={handleChange}
            disabled={isScraping}
          />
        </div>

        <div className="flex flex-col gap-1 relative group">
          <label
            htmlFor="postedWithin"
            className="text-xs uppercase text-brand-muted tracking-widest bg-brand-dark px-1 absolute -top-2 left-2 group-focus-within:text-brand-cyan transition-colors z-10"
          >
            TIMEFRAME
          </label>
          <select
            id="postedWithin"
            name="postedWithin"
            className="brutal-input py-3 mt-1 appearance-none bg-brand-dark"
            value={formData.postedWithin}
            onChange={handleChange}
            disabled={isScraping}
          >
            <option value="">Any Time</option>
            <option value="Past 24 hours">24 HOURS</option>
            <option value="Past week">1 WEEK</option>
            <option value="Past month">1 MONTH</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1 relative group">
        <label
          htmlFor="experienceLevel"
          className="text-xs uppercase text-brand-muted tracking-widest bg-brand-dark px-1 absolute -top-2 left-2 group-focus-within:text-brand-cyan transition-colors z-10"
        >
          EXP_LEVEL
        </label>
        <input
          id="experienceLevel"
          name="experienceLevel"
          type="text"
          placeholder="Internship, Entry level"
          className="brutal-input py-3 mt-1"
          value={formData.experienceLevel}
          onChange={handleChange}
          disabled={isScraping}
        />
        <span className="text-[10px] text-brand-muted ml-1 uppercase">
          COMMA_SEPARATED
        </span>
      </div>

      <div className="flex flex-col gap-1 relative group">
        <label
          htmlFor="jobType"
          className="text-xs uppercase text-brand-muted tracking-widest bg-brand-dark px-1 absolute -top-2 left-2 group-focus-within:text-brand-cyan transition-colors z-10"
        >
          JOB_TYPE
        </label>
        <input
          id="jobType"
          name="jobType"
          type="text"
          placeholder="Full-time, Part-time"
          className="brutal-input py-3 mt-1"
          value={formData.jobType}
          onChange={handleChange}
          disabled={isScraping}
        />
      </div>

      <div className="p-4 border border-brand-border bg-brand-panel relative flex flex-col gap-3">
        <div className="absolute top-0 right-0 bg-brand-border text-brand-dark text-xs px-2 font-bold uppercase">
          FLAGS
        </div>

        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              name="remoteOnly"
              checked={formData.remoteOnly}
              onChange={handleChange}
              disabled={isScraping}
              className="peer sr-only"
            />
            <div className="w-5 h-5 border-2 border-brand-border peer-checked:bg-brand-ok peer-checked:border-brand-ok transition-colors flex items-center justify-center">
              <div className="w-2 h-2 bg-brand-dark scale-0 peer-checked:scale-100 transition-transform"></div>
            </div>
          </div>
          <span className="text-sm uppercase tracking-wider group-hover:text-brand-ok transition-colors">
            REMOTE_ONLY
          </span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              name="headless"
              checked={formData.headless}
              onChange={handleChange}
              disabled={isScraping}
              className="peer sr-only"
            />
            <div className="w-5 h-5 border-2 border-brand-border peer-checked:bg-brand-accent peer-checked:border-brand-accent transition-colors flex items-center justify-center">
              <div className="w-2 h-2 bg-brand-dark scale-0 peer-checked:scale-100 transition-transform"></div>
            </div>
          </div>
          <span className="text-sm uppercase tracking-wider group-hover:text-brand-accent transition-colors">
            HEADLESS_MODE
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={isScraping}
        className="brutal-btn primary w-full mt-4 flex justify-center items-center gap-3 text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-brand-accent disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:shadow-none"
      >
        <Play fill="currentColor" />
        {isScraping ? 'EXECUTING...' : 'INITIATE_SEQUENCE'}
      </button>
    </form>
  );
}
