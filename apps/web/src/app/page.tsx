import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="qubit-circuit-bg flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center text-white">
      <Image src="/qubit-icon.png" alt="Qubit" width={72} height={62} priority style={{ height: "auto" }} />
      <span className="font-accent rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-qubit-blue-400">
        AI Requirements &amp; QA
      </span>
      <h1 className="font-heading max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">
        Qubit
      </h1>
      <p className="max-w-xl text-balance text-white/75">
        Describe una necesidad de software en lenguaje natural y recibe una historia de usuario
        detallada al instante, o — en los planes Team y Empresa — el análisis completo:
        requerimientos, historias, criterios de aceptación, modelo de datos, API sugerida y
        casos de prueba. Editable, versionado y exportable a PDF y Word.
      </p>
      <div className="flex gap-4">
        <Link
          href="/register"
          className="font-accent rounded-md bg-qubit-blue-400 px-5 py-2.5 text-sm font-semibold text-qubit-navy shadow-lg shadow-qubit-blue-400/20 transition hover:bg-qubit-blue-600 hover:text-white"
        >
          Crear cuenta
        </Link>
        <Link
          href="/login"
          className="font-accent rounded-md border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Iniciar sesión
        </Link>
      </div>
    </main>
  );
}
