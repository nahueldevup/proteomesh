export default function NoTocar() {
  return (
    <button
      className="w-screen h-screen bg-red-600 text-white text-9xl font-black uppercase tracking-widest hover:bg-red-700 active:bg-red-800"
      onClick={() => alert("¡Iniciando autodestrucción del Punto de Venta!")}
    >
      NO TOCAR
    </button>
  );
}
