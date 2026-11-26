/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_FLAGSMITH_ENV_KEY?: string
  readonly VITE_FLAGSMITH_ENV_NAME?: 'development' | 'production'
  /** Public repository, e.g. https://github.com/<owner>/<repo>. Optional; the footer hides GitHub without it. */
  readonly VITE_REPO_URL?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
