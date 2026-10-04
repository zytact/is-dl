import { Play } from 'lucide-react';
import { useState } from 'react';
import {
  JOB_SOURCES,
  type JobSource,
  roleLabel,
  SOURCE_LABELS,
  UNSTOP_OPPORTUNITIES,
  UNSTOP_ROLES,
  type UnstopOpportunity,
} from '../types';

export interface ScraperFormData {
  keywords: string;
  location: string;
  limit: number;
  experienceLevel: string;
  jobType: string;
  remoteOnly: boolean;
  postedWithin: string;
  headless: boolean;
  excludeSeen: boolean;
  excludeApplied: boolean;
  excludeUnpaid: boolean;
  sources: JobSource[];
  unstopOpportunity: UnstopOpportunity;
  unstopRoles: string[];
}

type FlagName = 'remoteOnly' | 'headless' | 'excludeSeen' | 'excludeApplied' | 'excludeUnpaid';

const OK = 'peer-checked:bg-brand-ok peer-checked:border-brand-ok';
const ACCENT = 'peer-checked:bg-brand-accent peer-checked:border-brand-accent';

// Tailwind only generates classes it finds written out whole, so they are not assembled.
const FLAGS: { name: FlagName; label: string; checked: string; hover: string }[] = [
  { name: 'remoteOnly', label: 'REMOTE_ONLY', checked: OK, hover: 'group-hover:text-brand-ok' },
  {
    name: 'headless',
    label: 'HEADLESS_MODE',
    checked: ACCENT,
    hover: 'group-hover:text-brand-accent',
  },
  { name: 'excludeSeen', label: 'SKIP_SEEN', checked: OK, hover: 'group-hover:text-brand-ok' },
  {
    name: 'excludeApplied',
    label: 'SKIP_APPLIED',
    checked: OK,
    hover: 'group-hover:text-brand-ok',
  },
  { name: 'excludeUnpaid', label: 'SKIP_UNPAID', checked: OK, hover: 'group-hover:text-brand-ok' },
];

interface ScraperFormProps {
  onStart: (data: ScraperFormData) => void;
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
    excludeSeen: false,
    excludeApplied: false,
    excludeUnpaid: false,
    unstopOpportunity: 'jobs' as UnstopOpportunity,
  });
  const [sources, setSources] = useState<JobSource[]>([...JOB_SOURCES]);
  const [unstopRoles, setUnstopRoles] = useState<string[]>(['software-development']);

  const unstopSelected = sources.includes('unstop');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const input = e.target as HTMLInputElement;
    const val =
      type === 'checkbox' ? input.checked : type === 'number' ? input.valueAsNumber : value;
    setFormData((prev) => ({ ...prev, [name]: val }));
  };

  const toggleSource = (source: JobSource) => {
    setSources((prev) =>
      prev.includes(source) ? prev.filter((item) => item !== source) : [...prev, source],
    );
  };

  const toggleRole = (role: string) => {
    setUnstopRoles((prev) =>
      prev.includes(role) ? prev.filter((item) => item !== role) : [...prev, role],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStart({
      ...formData,
      sources,
      unstopRoles: unstopSelected ? unstopRoles : [],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex justify-between border-b border-brand-border pb-2">
        <h3 className="text-brand-cyan tracking-widest font-bold uppercase">TARGET_PARAMS</h3>
      </div>

      <div className="p-4 border border-brand-border bg-brand-panel relative flex flex-col gap-3">
        <div className="absolute top-0 right-0 bg-brand-cyan text-brand-dark text-xs px-2 font-bold uppercase">
          BOARDS
        </div>
        <div className="grid grid-cols-2 gap-2">
          {JOB_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => toggleSource(source)}
              disabled={isScraping}
              aria-pressed={sources.includes(source)}
              className={`border px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors disabled:opacity-50 ${
                sources.includes(source)
                  ? 'border-brand-cyan bg-brand-cyan/10 text-brand-cyan'
                  : 'border-brand-border text-brand-muted hover:border-brand-text hover:text-brand-text'
              }`}
            >
              {SOURCE_LABELS[source]}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-brand-muted uppercase tracking-widest">
          {sources.length === 0
            ? 'PICK AT LEAST ONE BOARD'
            : 'LINKEDIN NEEDS A STORED SESSION. UNSTOP NEEDS NONE.'}
        </span>
      </div>

      {unstopSelected && (
        <div className="p-4 border border-brand-border bg-brand-panel relative flex flex-col gap-4">
          <div className="absolute top-0 right-0 bg-brand-border text-brand-dark text-xs px-2 font-bold uppercase">
            UNSTOP
          </div>

          <div className="flex flex-col gap-1 relative group">
            <label
              htmlFor="unstopOpportunity"
              className="text-xs uppercase text-brand-muted tracking-widest bg-brand-panel px-1 absolute -top-2 left-2 group-focus-within:text-brand-cyan transition-colors z-10"
            >
              OPPORTUNITY
            </label>
            <select
              id="unstopOpportunity"
              name="unstopOpportunity"
              className="brutal-input py-3 mt-1 appearance-none bg-brand-dark"
              value={formData.unstopOpportunity}
              onChange={handleChange}
              disabled={isScraping}
            >
              {UNSTOP_OPPORTUNITIES.map((opportunity) => (
                <option key={opportunity} value={opportunity}>
                  {opportunity.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase text-brand-muted tracking-widest">
              WORK_FUNCTION
            </span>
            <div className="grid grid-cols-2 gap-2">
              {UNSTOP_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  disabled={isScraping}
                  aria-pressed={unstopRoles.includes(role)}
                  className={`border px-2 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors disabled:opacity-50 ${
                    unstopRoles.includes(role)
                      ? 'border-brand-accent bg-brand-accent/10 text-brand-accent'
                      : 'border-brand-border text-brand-muted hover:border-brand-text hover:text-brand-text'
                  }`}
                >
                  {roleLabel(role)}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-brand-muted uppercase tracking-widest">
              {unstopRoles.length === 0
                ? 'NO FILTER: MOSTLY SALES AND SUPPORT ROLES'
                : 'UNSTOP LISTS EVERY FUNCTION. NARROW IT OR EXPECT SALES.'}
            </span>
          </div>
        </div>
      )}

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
        <span className="text-[10px] text-brand-muted ml-1 uppercase">COMMA_SEPARATED</span>
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

        {FLAGS.map(({ name, label, checked, hover }) => (
          <label key={name} className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                name={name}
                checked={formData[name]}
                onChange={handleChange}
                disabled={isScraping}
                className="peer sr-only"
              />
              <div
                className={`w-5 h-5 border-2 border-brand-border ${checked} transition-colors flex items-center justify-center`}
              >
                <div className="w-2 h-2 bg-brand-dark scale-0 peer-checked:scale-100 transition-transform"></div>
              </div>
            </div>
            <span className={`text-sm uppercase tracking-wider ${hover} transition-colors`}>
              {label}
            </span>
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={isScraping || sources.length === 0}
        className="brutal-btn primary w-full mt-4 flex justify-center items-center gap-3 text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-brand-accent disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:shadow-none"
      >
        <Play fill="currentColor" />
        {isScraping ? 'EXECUTING...' : 'INITIATE_SEQUENCE'}
      </button>
    </form>
  );
}
