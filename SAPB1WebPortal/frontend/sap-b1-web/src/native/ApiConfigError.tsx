/** Shown instead of the app when the installed build has no valid HTTPS API address (see platform.ts). Never shown on the website. */
export default function ApiConfigError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-950 text-white p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold">Aquila Portal can't connect</h1>
        <p className="text-sm text-slate-300">{message}</p>
        <p className="text-xs text-slate-400">This is a configuration problem in the app build, not a problem with your account.</p>
      </div>
    </div>
  );
}
