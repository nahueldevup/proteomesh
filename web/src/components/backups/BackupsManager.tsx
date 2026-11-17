import { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Lock,
  Unlock,
  Download,
  Trash2,
  RefreshCw,
  Plus,
  AlertTriangle,
  FileArchive,
  Database,
  KeyRound,
  Eye,
  EyeOff,
  Search,
  CheckCircle2,
  HardDrive,
  Info,
  X,
  RotateCcw,
  Clock,
  Play,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useBackups, useBackupSchedule, queryKeys } from '../../lib/queries';
import { api } from '../../lib/api';
import type { BackupItem } from '../../types';
import { cn } from '../../lib/utils';
import { IconBtn } from '../ui/IconBtn';

export function BackupsManager() {
  const queryClient = useQueryClient();
  const { data: backups = [], isLoading, isFetching, refetch } = useBackups();

  // Estados de filtrado y búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'encrypted' | 'plain'>('all');

  // Modales
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupItem | null>(null);

  // Formulario de creación
  const [createEncrypt, setCreateEncrypt] = useState(true);
  const [createPassphrase, setCreatePassphrase] = useState('');
  const [showCreatePass, setShowCreatePass] = useState(false);
  const [createIncludeDb, setCreateIncludeDb] = useState(true);
  const [createKeep, setCreateKeep] = useState(5);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Formulario de verificación
  const [verifyPassphrase, setVerifyPassphrase] = useState('');
  const [showVerifyPass, setShowVerifyPass] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; message: string } | null>(null);

  // Formulario de restauración
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [showRestorePass, setShowRestorePass] = useState(false);
  const [confirmDestructive, setConfirmDestructive] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Consulta de programación de backups
  const { data: schedule } = useBackupSchedule();

  // Estados del modal de programación
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [schedEnabled, setSchedEnabled] = useState(true);
  const [schedFrequency, setSchedFrequency] = useState<'daily' | 'weekly'>('daily');
  const [schedTime, setSchedTime] = useState('03:00');
  const [schedKeep, setSchedKeep] = useState(5);
  const [schedEncrypt, setSchedEncrypt] = useState(false);
  const [schedPassphrase, setSchedPassphrase] = useState('');
  const [showSchedPass, setShowSchedPass] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isTriggeringNow, setIsTriggeringNow] = useState(false);

  // Filtrado de backups
  const filteredBackups = useMemo(() => {
    return backups.filter((b) => {
      const matchSearch = b.filename.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;
      if (filterType === 'encrypted') return b.encrypted;
      if (filterType === 'plain') return !b.encrypted;
      return true;
    });
  }, [backups, searchQuery, filterType]);

  // Estadísticas KPI
  const stats = useMemo(() => {
    const totalBytes = backups.reduce((acc, b) => acc + b.size_bytes, 0);
    const encryptedCount = backups.filter((b) => b.encrypted).length;
    let sizeHuman = `${(totalBytes / 1024).toFixed(1)} KB`;
    if (totalBytes > 1024 * 1024) {
      sizeHuman = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    const lastBackup = backups.length > 0 ? backups[0].modified_at : null;
    return {
      total: backups.length,
      totalBytes,
      sizeHuman,
      encryptedCount,
      lastBackup,
    };
  }, [backups]);

  // Handlers
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createEncrypt && !createPassphrase.trim()) {
      toast.error('Debe ingresar una frase de paso para el cifrado AES-256');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const result = await api.createBackup({
        passphrase: createEncrypt ? createPassphrase : undefined,
        no_encrypt: !createEncrypt,
        include_db: createIncludeDb,
        keep: createKeep,
      });
      toast.success(`Respaldo creado con éxito: ${result.filename}`);
      setIsCreateOpen(false);
      setCreatePassphrase('');
      queryClient.invalidateQueries({ queryKey: queryKeys.backups });
    } catch (err: any) {
      toast.error(`Error al crear respaldo: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleDelete = async (backup: BackupItem) => {
    if (!confirm(`¿Eliminar permanentemente el respaldo '${backup.filename}'?`)) {
      return;
    }
    try {
      await api.deleteBackup(backup.filename);
      toast.success(`Respaldo eliminado: ${backup.filename}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.backups });
    } catch (err: any) {
      toast.error(`No se pudo eliminar el respaldo: ${err.message}`);
    }
  };

  const handleOpenVerify = (backup: BackupItem) => {
    setSelectedBackup(backup);
    setVerifyPassphrase('');
    setVerifyResult(null);
    setIsVerifyOpen(true);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBackup) return;

    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const res = await api.verifyBackup({
        filename: selectedBackup.filename,
        passphrase: selectedBackup.encrypted ? verifyPassphrase : undefined,
      });
      setVerifyResult({ valid: res.valid, message: res.message });
      toast.success('Integridad del archivo verificada exitosamente');
    } catch (err: any) {
      setVerifyResult({ valid: false, message: err.message || 'Fallo de descifrado' });
      toast.error('Fallo en la verificación del respaldo');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleOpenRestore = (backup: BackupItem) => {
    setSelectedBackup(backup);
    setRestorePassphrase('');
    setShowRestorePass(false);
    setConfirmDestructive(false);
    setIsRestoreOpen(true);
  };

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBackup) return;

    if (selectedBackup.encrypted && !restorePassphrase.trim()) {
      toast.error('Debe ingresar la frase de paso para descifrar y restaurar');
      return;
    }

    if (!confirmDestructive) {
      toast.error('Debe confirmar la sobreescritura de identidades');
      return;
    }

    setIsRestoring(true);
    try {
      await api.restoreBackup({
        filename: selectedBackup.filename,
        passphrase: selectedBackup.encrypted ? restorePassphrase : undefined,
      });
      toast.success(`Respaldo restaurado con éxito desde '${selectedBackup.filename}'`);
      setIsRestoreOpen(false);

      // Invalidar consultas relevantes para recargar las identidades restauradas
      queryClient.invalidateQueries({ queryKey: queryKeys.backups });
      queryClient.invalidateQueries({ queryKey: queryKeys.instances });
      queryClient.invalidateQueries({ queryKey: queryKeys.ipLedger });
      queryClient.invalidateQueries({ queryKey: queryKeys.usb });
    } catch (err: any) {
      toast.error(`Error al restaurar respaldo: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleOpenSchedule = () => {
    if (schedule) {
      setSchedEnabled(schedule.active);
      setSchedFrequency(schedule.frequency === 'weekly' ? 'weekly' : 'daily');
      setSchedTime(schedule.time || '03:00');
      setSchedKeep(schedule.keep || 5);
      setSchedEncrypt(schedule.encrypted);
    }
    setSchedPassphrase('');
    setShowSchedPass(false);
    setIsScheduleOpen(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSchedule(true);
    try {
      await api.updateBackupSchedule({
        enabled: schedEnabled,
        frequency: schedFrequency,
        time: schedTime,
        keep: schedKeep,
        no_encrypt: !schedEncrypt,
        passphrase: schedEncrypt && schedPassphrase.trim() ? schedPassphrase.trim() : undefined,
      });
      toast.success(
        schedEnabled
          ? 'Programación de respaldos guardada y activada'
          : 'Programación de respaldos deshabilitada'
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.backupSchedule });
      setIsScheduleOpen(false);
    } catch (err: any) {
      toast.error(`Error al actualizar programación: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleTriggerScheduleNow = async () => {
    setIsTriggeringNow(true);
    try {
      await api.triggerBackupScheduleNow();
      toast.success('Respaldo automático ejecutado exitosamente en segundo plano');
      queryClient.invalidateQueries({ queryKey: queryKeys.backups });
      queryClient.invalidateQueries({ queryKey: queryKeys.backupSchedule });
    } catch (err: any) {
      toast.error(`Error al ejecutar respaldo: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsTriggeringNow(false);
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground overflow-y-auto">
      {/* ── CABECERA PRINCIPAL ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-sm bg-primary/10 text-primary border border-primary/20">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-sm font-bold tracking-wider text-foreground">
                IDENTIDADES Y BACKUPS DE HARDWARE
              </h1>
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground border border-border">
                {backups.length}
              </span>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground hidden sm:block">
              Resguardo criptográfico de hardware determinista (IMEI, MAC, serial) y base de datos de flota.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenSchedule}
            className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-1.5 font-mono text-xs font-semibold text-foreground shadow-xs hover:bg-muted transition-colors"
          >
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>Programación</span>
          </button>
          <IconBtn
            icon={RefreshCw}
            label="Actualizar lista de respaldos"
            onClick={() => refetch()}
            className={cn(isFetching && 'animate-spin')}
          />
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 rounded-sm bg-primary px-3 py-1.5 font-mono text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Crear Respaldo</span>
          </button>
        </div>
      </header>

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* ── KPI STATS CARDS ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-sm border border-border bg-card p-4 flex items-center justify-between shadow-xs">
            <div>
              <div className="font-mono text-[11px] text-muted-foreground uppercase">Total Respaldos</div>
              <div className="mt-1 font-mono text-2xl font-bold">{stats.total}</div>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-sm bg-muted/60 text-muted-foreground">
              <FileArchive className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-4 flex items-center justify-between shadow-xs">
            <div>
              <div className="font-mono text-[11px] text-muted-foreground uppercase">Espacio Utilizado</div>
              <div className="mt-1 font-mono text-2xl font-bold">{stats.sizeHuman}</div>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-sm bg-muted/60 text-muted-foreground">
              <HardDrive className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-4 flex items-center justify-between shadow-xs">
            <div>
              <div className="font-mono text-[11px] text-muted-foreground uppercase">Cifrado Militar</div>
              <div className="mt-1 flex items-center gap-1.5 font-mono text-lg font-bold text-emerald-500">
                <Lock className="h-4 w-4" />
                <span>AES-256</span>
              </div>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-sm bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-4 flex items-center justify-between shadow-xs">
            <div>
              <div className="font-mono text-[11px] text-muted-foreground uppercase">Base de Datos</div>
              <div className="mt-1 font-mono text-base font-semibold truncate text-foreground">
                Snapshot Atómico
              </div>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-sm bg-primary/10 text-primary border border-primary/20">
              <Database className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* ── BANNER / CARD DE AUTOMATIZACIÓN ───────────────────────────────── */}
        <div className="rounded-sm border border-border bg-card p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-sm border mt-0.5',
                schedule?.active
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-muted text-muted-foreground border-border'
              )}
            >
              <Clock className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground tracking-wide">
                  AUTOMATIZACIÓN EN SEGUNDO PLANO (SYSTEMD TIMER)
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                    schedule?.active
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                      : 'bg-muted text-muted-foreground border-border'
                  )}
                >
                  {schedule?.active ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {schedule?.active ? (
                  <>
                    <span>
                      Ejecución {schedule.frequency === 'weekly' ? 'Semanal (Lunes)' : 'Diaria'} a las {schedule.time} hs · Conserva {schedule.keep} copias
                    </span>
                    {schedule.next_run && (
                      <span className="block text-[10px] text-foreground/80 mt-0.5">
                        Próxima activación: {schedule.next_run}
                      </span>
                    )}
                  </>
                ) : (
                  'Sin programar. El sistema no realiza respaldos periódicos automáticos.'
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            {schedule?.active && (
              <button
                type="button"
                onClick={handleTriggerScheduleNow}
                disabled={isTriggeringNow}
                className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 shadow-xs"
                title="Ejecutar de inmediato el servicio para verificarlo"
              >
                {isTriggeringNow ? (
                  <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                ) : (
                  <Play className="h-3 w-3 text-emerald-500" />
                )}
                <span>{isTriggeringNow ? 'Ejecutando…' : 'Probar Ahora'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenSchedule}
              className="flex items-center gap-1.5 rounded-sm bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors shadow-xs"
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>Configurar</span>
            </button>
          </div>
        </div>

        {/* ── BARRA DE BÚSQUEDA Y FILTRO ────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar respaldo por nombre o fecha…"
              className="h-8 w-full rounded-sm border border-border bg-card pl-8 pr-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-1 self-start sm:self-auto rounded-sm border border-border bg-muted/40 p-0.5 text-xs">
            {(['all', 'encrypted', 'plain'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterType(mode)}
                className={cn(
                  'rounded-xs px-2.5 py-1 font-mono text-[11px] transition-colors',
                  filterType === mode
                    ? 'bg-card text-foreground font-bold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {mode === 'all' && 'Todos'}
                {mode === 'encrypted' && 'Cifrados (AES)'}
                {mode === 'plain' && 'Sin Cifrar'}
              </button>
            ))}
          </div>
        </div>

        {/* ── LISTADO / TABLA DE RESPALDOS ──────────────────────────────────── */}
        <div className="rounded-sm border border-border bg-card shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center font-mono text-xs text-muted-foreground animate-pulse">
              Cargando historial de respaldos…
            </div>
          ) : filteredBackups.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted/60 text-muted-foreground mb-3">
                <FileArchive className="h-6 w-6" />
              </div>
              <h3 className="font-mono text-sm font-semibold text-foreground">
                No se encontraron respaldos
              </h3>
              <p className="mt-1 max-w-sm font-mono text-xs text-muted-foreground">
                {backups.length === 0
                  ? 'Aún no has generado ningún backup de identidades. Generá tu primer respaldo para proteger el hardware determinista de tus CloudPhones.'
                  : 'Ningún archivo coincide con los criterios de búsqueda aplicados.'}
              </p>
              {backups.length === 0 && (
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  className="mt-4 flex items-center gap-2 rounded-sm bg-primary px-3 py-1.5 font-mono text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Crear Primer Respaldo</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead className="border-b border-border bg-muted/30 text-[11px] text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2.5 px-4">Archivo / Identificador</th>
                    <th className="py-2.5 px-4">Seguridad</th>
                    <th className="py-2.5 px-4">Tamaño</th>
                    <th className="py-2.5 px-4">Fecha de Generación</th>
                    <th className="py-2.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredBackups.map((b) => (
                    <tr key={b.filename} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-medium">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              'grid h-7 w-7 shrink-0 place-items-center rounded-sm',
                              b.encrypted
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            )}
                          >
                            {b.encrypted ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                          </div>
                          <span className="truncate max-w-md font-semibold text-foreground">
                            {b.filename}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {b.encrypted ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-500 border border-emerald-500/30">
                            <ShieldCheck className="h-3 w-3" />
                            <span>AES-256 PBKDF2</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-500 border border-amber-500/30">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Sin Cifrar</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-muted-foreground">{b.size_human}</td>

                      <td className="py-3 px-4 text-muted-foreground">{formatDate(b.modified_at)}</td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Descargar */}
                          <a
                            href={api.getDownloadBackupUrl(b.filename)}
                            download={b.filename}
                            title="Descargar archivo a tu equipo"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>

                          {/* Verificar */}
                          <button
                            type="button"
                            title="Verificar integridad criptográfica"
                            onClick={() => handleOpenVerify(b)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </button>

                          {/* Restaurar */}
                          <button
                            type="button"
                            title="Restaurar identidades desde este respaldo"
                            onClick={() => handleOpenRestore(b)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>

                          {/* Eliminar */}
                          <button
                            type="button"
                            title="Eliminar este respaldo"
                            onClick={() => handleDelete(b)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: CREAR RESPALDO ──────────────────────────────────────────── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-sm border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h2 className="font-mono text-sm font-bold tracking-wider">CREAR NUEVO RESPALDO</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 font-mono text-xs">
              <div className="rounded-sm bg-muted/40 p-3 border border-border/60 text-muted-foreground text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Info className="h-3.5 w-3.5 text-primary" />
                  <span>Contenido del respaldo</span>
                </div>
                <p>
                  Empaqueta de forma atómica <span className="text-foreground">profile.json</span>,{' '}
                  <span className="text-foreground">manifest.json</span>,{' '}
                  <span className="text-foreground">meta.json</span> y{' '}
                  <span className="text-foreground">proteomesh.db</span>.
                </p>
              </div>

              {/* Toggle Cifrado */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <div className="font-semibold text-foreground">Cifrado Militar AES-256</div>
                  <div className="text-[10px] text-muted-foreground">
                    Protege IMEIs, números de serie y claves con PBKDF2
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={createEncrypt}
                  onChange={(e) => setCreateEncrypt(e.target.checked)}
                  className="h-4 w-4 accent-primary cursor-pointer"
                />
              </div>

              {/* Campo Frase de Paso (si cifrado está activo) */}
              {createEncrypt && (
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground flex items-center justify-between">
                    <span>Frase de Paso de Cifrado</span>
                    <button
                      type="button"
                      onClick={() => setShowCreatePass(!showCreatePass)}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px]"
                    >
                      {showCreatePass ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      <span>{showCreatePass ? 'Ocultar' : 'Mostrar'}</span>
                    </button>
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type={showCreatePass ? 'text' : 'password'}
                      value={createPassphrase}
                      onChange={(e) => setCreatePassphrase(e.target.value)}
                      placeholder="Ingresá una frase de paso segura…"
                      required={createEncrypt}
                      className="h-8 w-full rounded-sm border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <p className="text-[10px] text-amber-500 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>Guardá esta clave en tu gestor de contraseñas para restaurar.</span>
                  </p>
                </div>
              )}

              {/* Toggle Base de Datos */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <div className="font-semibold text-foreground">Snapshot de proteomesh.db</div>
                  <div className="text-[10px] text-muted-foreground">
                    Copia consistente sin riesgo de lock SQLite
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={createIncludeDb}
                  onChange={(e) => setCreateIncludeDb(e.target.checked)}
                  className="h-4 w-4 accent-primary cursor-pointer"
                />
              </div>

              {/* Política de Rotación */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">
                  Política de Retención (Conservar últimos N)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={createKeep}
                  onChange={(e) => setCreateKeep(Number(e.target.value))}
                  className="h-8 w-full rounded-sm border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="text-[10px] text-muted-foreground">
                  Los backups que excedan este límite se depurarán automáticamente.
                </p>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {isSubmittingCreate && <RefreshCw className="h-3 w-3 animate-spin" />}
                  <span>{isSubmittingCreate ? 'Generando…' : 'Crear Respaldo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: VERIFICAR RESPALDO ──────────────────────────────────────── */}
      {isVerifyOpen && selectedBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-sm border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
                <h2 className="font-mono text-sm font-bold tracking-wider">VERIFICAR INTEGRIDAD</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsVerifyOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleVerifySubmit} className="space-y-4 font-mono text-xs">
              <div className="rounded-sm bg-muted/40 p-3 border border-border/60 text-muted-foreground text-[11px] space-y-1">
                <div className="font-semibold text-foreground">Archivo Seleccionado:</div>
                <div className="font-mono text-foreground break-all">{selectedBackup.filename}</div>
              </div>

              {selectedBackup.encrypted && (
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground flex items-center justify-between">
                    <span>Frase de Paso para Descifrar</span>
                    <button
                      type="button"
                      onClick={() => setShowVerifyPass(!showVerifyPass)}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px]"
                    >
                      {showVerifyPass ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      <span>{showVerifyPass ? 'Ocultar' : 'Mostrar'}</span>
                    </button>
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type={showVerifyPass ? 'text' : 'password'}
                      value={verifyPassphrase}
                      onChange={(e) => setVerifyPassphrase(e.target.value)}
                      placeholder="Ingresá la contraseña del archivo…"
                      required
                      className="h-8 w-full rounded-sm border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              )}

              {verifyResult && (
                <div
                  className={cn(
                    'rounded-sm p-3 border text-[11px] flex items-start gap-2',
                    verifyResult.valid
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                      : 'bg-destructive/10 border-destructive/30 text-destructive'
                  )}
                >
                  {verifyResult.valid ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">
                      {verifyResult.valid ? 'Archivo Íntegro y Válido' : 'Fallo de Verificación'}
                    </div>
                    <div className="opacity-90">{verifyResult.message}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsVerifyOpen(false)}
                  className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {isVerifying && <RefreshCw className="h-3 w-3 animate-spin" />}
                  <span>{isVerifying ? 'Verificando…' : 'Comprobar Integridad'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── MODAL: RESTAURAR RESPALDO ────────────────────────────────────── */}
      {isRestoreOpen && selectedBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-sm border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-primary" />
                <h2 className="font-mono text-sm font-bold tracking-wider">RESTAURAR IDENTIDADES</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsRestoreOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleRestoreSubmit} className="space-y-4 font-mono text-xs">
              <div className="rounded-sm bg-muted/40 p-3 border border-border/60 text-muted-foreground text-[11px] space-y-1">
                <div className="font-semibold text-foreground">Archivo a Restaurar:</div>
                <div className="font-mono text-foreground break-all">{selectedBackup.filename}</div>
                <div className="text-[10px] text-muted-foreground">
                  Tamaño: {selectedBackup.size_human} · Cifrado: {selectedBackup.encrypted ? 'AES-256' : 'Sin Cifrar'}
                </div>
              </div>

              {/* Advertencia de Sobreescritura */}
              <div className="rounded-sm bg-amber-500/10 border border-amber-500/30 p-3 text-amber-500 text-[11px] flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">Advertencia de Sobreescritura</div>
                  <p className="opacity-90 leading-relaxed">
                    Esta operación reemplazará los perfiles de hardware (IMEI, MAC, serial) y la base de datos de flota activa con el contenido de este respaldo.
                  </p>
                </div>
              </div>

              {/* Frase de paso para descifrado si está cifrado */}
              {selectedBackup.encrypted && (
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground flex items-center justify-between">
                    <span>Frase de Paso para Descifrar</span>
                    <button
                      type="button"
                      onClick={() => setShowRestorePass(!showRestorePass)}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px]"
                    >
                      {showRestorePass ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      <span>{showRestorePass ? 'Ocultar' : 'Mostrar'}</span>
                    </button>
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type={showRestorePass ? 'text' : 'password'}
                      value={restorePassphrase}
                      onChange={(e) => setRestorePassphrase(e.target.value)}
                      placeholder="Ingresá la contraseña con la que se cifró el archivo…"
                      required
                      className="h-8 w-full rounded-sm border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              )}

              {/* Confirmación obligatoria */}
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmDestructive}
                  onChange={(e) => setConfirmDestructive(e.target.checked)}
                  className="h-4 w-4 rounded-xs accent-primary mt-0.5 cursor-pointer"
                />
                <span className="text-[11px] text-foreground">
                  Comprendo y confirmo la sobreescritura de las identidades y base de datos locales.
                </span>
              </label>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsRestoreOpen(false)}
                  className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRestoring || !confirmDestructive || (selectedBackup.encrypted && !restorePassphrase.trim())}
                  className="flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {isRestoring && <RefreshCw className="h-3 w-3 animate-spin" />}
                  <span>{isRestoring ? 'Restaurando…' : 'Restaurar Copia'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: PROGRAMAR RESPALDOS AUTOMÁTICOS ─────────────────────────── */}
      {isScheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-sm border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <h2 className="font-mono text-sm font-bold tracking-wider">
                  PROGRAMACIÓN DE RESPALDOS (SYSTEMD)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4 font-mono text-xs">
              {/* Toggle Habilitar/Deshabilitar */}
              <div className="flex items-center justify-between rounded-sm bg-muted/40 p-3 border border-border">
                <div>
                  <div className="font-bold text-foreground">
                    Ejecución automática en segundo plano
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Temporizador desatendido de bajo impacto (systemd user timer)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={schedEnabled}
                  onChange={(e) => setSchedEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary cursor-pointer"
                />
              </div>

              {schedEnabled && (
                <div className="space-y-4 pt-1">
                  {/* Frecuencia */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Frecuencia de Ejecución</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSchedFrequency('daily')}
                        className={cn(
                          'rounded-sm border p-2 text-left transition-colors',
                          schedFrequency === 'daily'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <div className="text-xs">Diario</div>
                        <div className="text-[10px] opacity-80">Todos los días</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchedFrequency('weekly')}
                        className={cn(
                          'rounded-sm border p-2 text-left transition-colors',
                          schedFrequency === 'weekly'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <div className="text-xs">Semanal</div>
                        <div className="text-[10px] opacity-80">Cada lunes</div>
                      </button>
                    </div>
                  </div>

                  {/* Hora de ejecución y Copias */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-semibold text-foreground">Hora de Ejecución (24h)</label>
                      <input
                        type="time"
                        value={schedTime}
                        onChange={(e) => setSchedTime(e.target.value)}
                        required
                        className="h-8 w-full rounded-sm border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-semibold text-foreground">Retención (Máx Copias)</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={schedKeep}
                        onChange={(e) => setSchedKeep(Number(e.target.value))}
                        required
                        className="h-8 w-full rounded-sm border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>

                  {/* Cifrado AES-256 */}
                  <div className="space-y-2 pt-1 border-t border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-foreground">Cifrado Criptográfico AES-256</div>
                        <div className="text-[10px] text-muted-foreground">
                          PBKDF2 con sal y vector de inicialización
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={schedEncrypt}
                        onChange={(e) => setSchedEncrypt(e.target.checked)}
                        className="h-4 w-4 accent-primary cursor-pointer"
                      />
                    </div>

                    {schedEncrypt && (
                      <div className="space-y-1.5 pt-1">
                        <label className="font-semibold text-foreground flex items-center justify-between">
                          <span>Contraseña de Cifrado Automático</span>
                          <button
                            type="button"
                            onClick={() => setShowSchedPass(!showSchedPass)}
                            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            {showSchedPass ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            <span>{showSchedPass ? 'Ocultar' : 'Ver'}</span>
                          </button>
                        </label>
                        <div className="relative">
                          <KeyRound className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                          <input
                            type={showSchedPass ? 'text' : 'password'}
                            value={schedPassphrase}
                            onChange={(e) => setSchedPassphrase(e.target.value)}
                            placeholder="Dejar vacío para mantener la llave previamente guardada…"
                            className="h-8 w-full rounded-sm border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Se guarda de forma aislada en ~/.config/proteomesh/backup.key (permisos 600) para permitir la ejecución desatendida.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Nota explicativa de consumo cero */}
              <div className="rounded-sm bg-muted/40 p-3 border border-border/80 text-[11px] text-muted-foreground flex items-start gap-2.5">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <p className="leading-relaxed">
                  El proceso se ejecuta como un temporizador nativo del sistema operativo (systemd timer). Consume <strong>0% CPU y 0 MB RAM</strong> mientras espera. Al llegar la hora exacta, despierta 2 segundos para generar el snapshot atómico y se apaga de inmediato.
                </p>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(false)}
                  className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingSchedule}
                  className="flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {isSavingSchedule && <RefreshCw className="h-3 w-3 animate-spin" />}
                  <span>{isSavingSchedule ? 'Guardando…' : 'Guardar y Aplicar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default BackupsManager;
