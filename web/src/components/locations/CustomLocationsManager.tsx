import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MapPin,
  Plus,
  Trash2,
  Search,
  Folder,
  Layers,
  ChevronDown,
  Globe,
  Edit2,
  X,
  Pin,
  Star,
  Check,
  CircleDot,
  Loader2,
} from 'lucide-react';
import type { CustomLocation, LocationGroup, Instance, LocationData, CustomLocationsCatalog } from '../../types';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useLocationsCatalog, EMPTY_CATALOG, queryKeys } from '../../lib/queries';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Switch } from '../ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { cn, getErrorMessage } from '../../lib/utils';
import { getPresetDisplay } from '../../lib/locations';
import type { MapPickerHandle, MapPinItem } from '../MapPicker';
import {
  DEFAULT_TZ,
  DEFAULT_PRESET_MARKER_ID,
  UNGROUPED_COLOR,
  type Scope,
  type JobState,
  sameCoords,
  isPhoneAtLocation,
  fieldClass,
  fieldLabelClass,
  toolbarBtnClass,
} from './locationsTypes';
import { LocationsMapHero } from './LocationsMapHero';
import { LocationsInspector } from './LocationsInspector';
import { LocationGroupModal } from './LocationGroupModal';

interface CustomLocationsManagerProps {
  instances: Instance[];
  onRefreshInstances?: () => void;
  locationPresets?: Record<string, LocationData>;
}

export const CustomLocationsManager: React.FC<CustomLocationsManagerProps> = ({
  instances,
  onRefreshInstances,
  locationPresets = {},
}) => {
  const queryClient = useQueryClient();
  const { data: catalog = EMPTY_CATALOG, isLoading: loading } = useLocationsCatalog();
  const mapHandleRef = useRef<MapPickerHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filtros de la barra de herramientas
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupsDropdownOpen, setGroupsDropdownOpen] = useState(false);
  const [groupFilterQuery, setGroupFilterQuery] = useState('');
  const [pinnedPopoverOpen, setPinnedPopoverOpen] = useState(false);
  const [pinnedSearchQuery, setPinnedSearchQuery] = useState('');

  // Selección del inspector y modo creación
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Estados del creador interactivo en el mapa (marcador arrastrable + formulario)
  const [mapLat, setMapLat] = useState(-34.603722);
  const [mapLon, setMapLon] = useState(-58.381592);
  const [mapCity, setMapCity] = useState('Buenos Aires');
  const [locName, setLocName] = useState('');
  const [locGroupId, setLocGroupId] = useState<string>('');
  const [locTimezone, setLocTimezone] = useState(DEFAULT_TZ);
  const [locAltitude, setLocAltitude] = useState(25);
  const [locIsPinned, setLocIsPinned] = useState(false);
  const [locSetAsDefault, setLocSetAsDefault] = useState(false);
  const [locShowRadius, setLocShowRadius] = useState(true);
  const [locRadiusKm, setLocRadiusKm] = useState(1.0);
  const [savingLoc, setSavingLoc] = useState(false);
  const [showAllRadii, setShowAllRadii] = useState(true);

  // Estados para editar ubicación completa
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<CustomLocation | null>(null);
  const [editName, setEditName] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editGroupId, setEditGroupId] = useState('');
  const [editTimezone, setEditTimezone] = useState(DEFAULT_TZ);
  const [editAltitude, setEditAltitude] = useState(25);
  const [editRadiusKm, setEditRadiusKm] = useState(1.0);
  const [editShowRadius, setEditShowRadius] = useState(true);
  const [savingEditLoc, setSavingEditLoc] = useState(false);
  const [editGroupSelectOpen, setEditGroupSelectOpen] = useState(false);
  const [formGroupSelectOpen, setFormGroupSelectOpen] = useState(false);

  // Teletransporte
  const [targets, setTargets] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const [teleporting, setTeleporting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Crear/editar/eliminar grupo y eliminar ubicación
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LocationGroup | null>(null);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupColorInput, setGroupColorInput] = useState('#10b981');
  const [groupDescInput, setGroupDescInput] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<LocationGroup | null>(null);
  const [locToDelete, setLocToDelete] = useState<CustomLocation | null>(null);

  const isMapInitializedRef = useRef(false);

  // Inicializar el mapa con la ubicación predeterminada general al cargar
  useEffect(() => {
    if (!isMapInitializedRef.current && catalog.default_location) {
      isMapInitializedRef.current = true;
      setMapLat(catalog.default_location.latitude);
      setMapLon(catalog.default_location.longitude);
      setMapCity(catalog.default_location.city);
      if (catalog.default_location.timezone) setLocTimezone(catalog.default_location.timezone);
      if (catalog.default_location.altitude) setLocAltitude(catalog.default_location.altitude);
    }
  }, [catalog.default_location]);

  /* ── Derivados ─────────────────────────────────────────────────────────── */

  const groupsMap = useMemo(() => {
    const map = new Map<string, LocationGroup>();
    catalog.groups.forEach((g) => map.set(g.id, g));
    return map;
  }, [catalog.groups]);

  const pinnedLocations = useMemo(() => catalog.locations.filter((loc) => loc.is_pinned), [catalog.locations]);

  const pinnedPresetsList = useMemo(() => {
    const list = catalog.pinned_presets || ['ba', 'sao-paulo', 'miami', 'new-york'];
    return list.map((key) => getPresetDisplay(key, locationPresets));
  }, [catalog.pinned_presets, locationPresets]);

  const phonesByLocation = useMemo(() => {
    const map = new Map<string, Instance[]>();
    catalog.locations.forEach((loc) => {
      map.set(
        loc.id,
        instances.filter((inst) => isPhoneAtLocation(inst, loc))
      );
    });
    return map;
  }, [catalog.locations, instances]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleLocations = useMemo(() => {
    return catalog.locations.filter((loc) => {
      const matchGroup = selectedGroupId ? loc.group_id === selectedGroupId : true;
      const matchScope = scope === 'all' || !!loc.is_pinned;
      const matchQuery = normalizedQuery
        ? loc.name.toLowerCase().includes(normalizedQuery) || loc.city.toLowerCase().includes(normalizedQuery)
        : true;
      return matchGroup && matchScope && matchQuery;
    });
  }, [catalog.locations, selectedGroupId, scope, normalizedQuery]);

  const sel = useMemo(
    () => (selectedId ? catalog.locations.find((l) => l.id === selectedId) ?? null : null),
    [catalog.locations, selectedId]
  );

  const defaultLoc = catalog.default_location;
  const defaultIsCustom = !!defaultLoc?.id && catalog.locations.some((l) => l.id === defaultLoc.id);

  // Pines del mapa con los teléfonos asignados para el tooltip
  const markers = useMemo<MapPinItem[]>(() => {
    const list = sel && !visibleLocations.some((l) => l.id === sel.id) ? [...visibleLocations, sel] : visibleLocations;
    const items: MapPinItem[] = list.map((loc) => {
      const grp = loc.group_id ? groupsMap.get(loc.group_id) : undefined;
      return {
        id: loc.id,
        name: loc.name,
        lat: loc.latitude,
        lon: loc.longitude,
        city: loc.city,
        color: grp?.color || UNGROUPED_COLOR,
        groupName: grp?.name,
        isDefault: defaultLoc?.id === loc.id,
        isPinned: !!loc.is_pinned,
        radius_km: loc.radius_km ?? 1.0,
        show_radius: loc.show_radius ?? true,
        phones: (phonesByLocation.get(loc.id) ?? []).map((p) => ({ name: p.instance_name, online: p.running })),
      };
    });
    if (defaultLoc && !defaultIsCustom) {
      items.push({
        id: DEFAULT_PRESET_MARKER_ID,
        name: defaultLoc.name,
        lat: defaultLoc.latitude,
        lon: defaultLoc.longitude,
        city: defaultLoc.city,
        color: '#f59e0b',
        isDefault: true,
        radius_km: 1.0,
        show_radius: true,
        phones: instances
          .filter((i) => i.location && sameCoords(i.location.latitude, i.location.longitude, defaultLoc.latitude, defaultLoc.longitude))
          .map((p) => ({ name: p.instance_name, online: p.running })),
      });
    }
    return items;
  }, [visibleLocations, sel, groupsMap, defaultLoc, defaultIsCustom, phonesByLocation, instances]);

  // Lista unificada de accesos rápidos para el Popover
  const combinedPinnedItems = useMemo(() => {
    const items: Array<{
      type: 'custom' | 'preset';
      id: string;
      name: string;
      city: string;
      latitude: number;
      longitude: number;
      timezone?: string;
      altitude?: number;
      groupColor?: string;
    }> = [];

    pinnedPresetsList.forEach((p) => {
      items.push({
        type: 'preset',
        id: p.key,
        name: p.name,
        city: p.city,
        latitude: p.latitude,
        longitude: p.longitude,
        timezone: p.timezone,
        altitude: p.altitude,
      });
    });

    pinnedLocations.forEach((loc) => {
      const grp = loc.group_id ? groupsMap.get(loc.group_id) : null;
      items.push({
        type: 'custom',
        id: loc.id,
        name: loc.name,
        city: loc.city,
        latitude: loc.latitude,
        longitude: loc.longitude,
        timezone: loc.timezone,
        altitude: loc.altitude,
        groupColor: grp?.color,
      });
    });

    return items;
  }, [pinnedPresetsList, pinnedLocations, groupsMap]);

  const filteredPinnedList = useMemo(() => {
    const q = pinnedSearchQuery.trim().toLowerCase();
    if (!q) return combinedPinnedItems;
    return combinedPinnedItems.filter(
      (item) => item.name.toLowerCase().includes(q) || item.city.toLowerCase().includes(q)
    );
  }, [combinedPinnedItems, pinnedSearchQuery]);

  const selectedGroup = useMemo(
    () => catalog.groups.find((g) => g.id === selectedGroupId),
    [catalog.groups, selectedGroupId]
  );

  const filteredDropdownGroups = useMemo(() => {
    const q = groupFilterQuery.trim().toLowerCase();
    if (!q) return catalog.groups;
    return catalog.groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [catalog.groups, groupFilterQuery]);

  const onlineCount = instances.filter((p) => p.running).length;
  const geolocatedCount = instances.filter((p) => !!p.location).length;
  const pinnedCount = pinnedLocations.length;
  const filtersActive = !!normalizedQuery || scope !== 'all' || !!selectedGroupId;
  const searchResults = normalizedQuery ? visibleLocations.slice(0, 6) : [];
  const selGroup = sel?.group_id ? groupsMap.get(sel.group_id) : undefined;
  const selColor = selGroup?.color || UNGROUPED_COLOR;
  const selIsDefault = !!sel && defaultLoc?.id === sel.id;

  /* ── Navegación del mapa ───────────────────────────────────────────────── */

  const resetTeleport = () => {
    setTargets([]);
    setJobs({});
  };

  const selectLocation = (loc: CustomLocation) => {
    setSelectedId(loc.id);
    setCreating(false);
    resetTeleport();
    setCopied(false);
    mapHandleRef.current?.flyTo(loc.latitude, loc.longitude);
  };

  const closeInspector = () => {
    setSelectedId(null);
    resetTeleport();
  };

  const startCreate = (coords?: { lat: number; lon: number }) => {
    const center = coords ?? mapHandleRef.current?.getCenter() ?? null;
    if (center) {
      setMapLat(Number(center.lat.toFixed(6)));
      setMapLon(Number(center.lon.toFixed(6)));
    }
    setLocShowRadius(true);
    setLocRadiusKm(1.0);
    setSelectedId(null);
    resetTeleport();
    setCreating(true);
  };

  const cancelCreate = () => {
    setCreating(false);
    setFormGroupSelectOpen(false);
    setLocShowRadius(true);
    setLocRadiusKm(1.0);
  };

  const centerOnDefault = () => {
    if (!defaultLoc) return;
    const match = defaultLoc.id ? catalog.locations.find((l) => l.id === defaultLoc.id) : undefined;
    if (match) {
      selectLocation(match);
    } else {
      mapHandleRef.current?.flyTo(defaultLoc.latitude, defaultLoc.longitude);
    }
    toast.info(`Centrado en predeterminada: ${defaultLoc.name}`);
  };

  const handleMarkerClick = (id: string) => {
    if (id === DEFAULT_PRESET_MARKER_ID) {
      centerOnDefault();
      return;
    }
    const loc = catalog.locations.find((l) => l.id === id);
    if (loc) selectLocation(loc);
  };

  const handleMapChange = (lat: number, lon: number, cityName?: string) => {
    setMapLat(lat);
    setMapLon(lon);
    if (cityName) setMapCity(cityName);
    if (!creating) {
      setSelectedId(null);
      resetTeleport();
      setCreating(true);
    }
  };

  const changeSelectedGroupId = (id: string | null) => {
    setSelectedGroupId(id);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setScope('all');
    setSelectedGroupId(null);
  };

  // Atajos: "/" enfoca el buscador, Esc cierra el inspector o cancela la creación
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key !== 'Escape' || typing) return;
      if (groupModalOpen || groupToDelete || locToDelete || groupsDropdownOpen || pinnedPopoverOpen) return;
      if (creating) setCreating(false);
      else if (selectedId) {
        setSelectedId(null);
        setTargets([]);
        setJobs({});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating, selectedId, groupModalOpen, groupToDelete, locToDelete, groupsDropdownOpen, pinnedPopoverOpen]);

  /* ── Acciones ─────────────────────────────────────────────────────────── */

  const handleTogglePin = async (type: 'custom' | 'preset', id: string, pinned?: boolean) => {
    try {
      const res = await api.togglePin(type, id, pinned);
      if (type === 'custom') {
        const updated = res.location as CustomLocation;
        queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            locations: prev.locations.map((loc) => (loc.id === id ? { ...loc, is_pinned: updated.is_pinned } : loc)),
          };
        });
        toast.success(
          updated.is_pinned
            ? `"${updated.name}" fijada en accesos rápidos de FocusView`
            : `"${updated.name}" desfijada de accesos rápidos`
        );
      } else {
        const pinnedList = (res.pinned_presets || []) as string[];
        queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
          if (!prev) return prev;
          return { ...prev, pinned_presets: pinnedList };
        });
        const isNowPinned = pinnedList.includes(id.toLowerCase());
        const info = getPresetDisplay(id, locationPresets);
        toast.success(
          isNowPinned ? `Preset "${info.name}" fijado en FocusView` : `Preset "${info.name}" desfijado de FocusView`
        );
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al alternar pin: ${getErrorMessage(err)}`);
    }
  };

  const handleSetDefaultLocation = async (type: 'custom' | 'preset', id: string, name: string) => {
    try {
      const res = await api.setDefaultLocation({ target_type: type, target_id: id });
      queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
        if (!prev) return prev;
        return { ...prev, default_location: res };
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });

      setMapLat(res.latitude);
      setMapLon(res.longitude);
      setMapCity(res.city);
      if (res.timezone) setLocTimezone(res.timezone);
      if (res.altitude) setLocAltitude(res.altitude);

      toast.success(`"${name}" configurada como ubicación predeterminada general`);
    } catch (err) {
      toast.error(`Error al establecer predeterminada: ${getErrorMessage(err)}`);
    }
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim()) {
      toast.error('Ingresá un nombre para la ubicación personalizada');
      return;
    }
    setSavingLoc(true);
    try {
      const created = await api.createCustomLocation({
        name: locName.trim(),
        group_id: locGroupId || undefined,
        city: mapCity.trim() || undefined,
        latitude: mapLat,
        longitude: mapLon,
        altitude: Number(locAltitude) || 25,
        timezone: locTimezone,
        is_pinned: locIsPinned,
        radius_km: Number(locRadiusKm) || 1.0,
        show_radius: locShowRadius,
      });

      if (locSetAsDefault) {
        await api.setDefaultLocation({ target_type: 'custom', target_id: created.id });
      }

      toast.success(
        locSetAsDefault
          ? `Ubicación "${created.name}" guardada y configurada como predeterminada del sistema`
          : locIsPinned
          ? `Ubicación "${created.name}" guardada y fijada en barra rápida`
          : `Ubicación "${created.name}" guardada con éxito`
      );
      setLocName('');
      setLocIsPinned(false);
      setLocSetAsDefault(false);
      setLocShowRadius(true);
      setLocRadiusKm(1.0);
      await queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
      setCreating(false);
      setSelectedId(created.id);
      resetTeleport();
    } catch (err) {
      toast.error(`Error al guardar: ${getErrorMessage(err)}`);
    } finally {
      setSavingLoc(false);
    }
  };

  const handleUpdateLocationRadius = async (locId: string, showRadius: boolean, radiusKm: number) => {
    try {
      const sanitizedKm = Math.max(0.05, Math.min(500, Number(radiusKm) || 1.0));
      const updated = await api.updateCustomLocation(locId, {
        show_radius: showRadius,
        radius_km: sanitizedKm,
      });
      queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          locations: prev.locations.map((l) => (l.id === locId ? { ...l, ...updated } : l)),
        };
      });
      toast.success(
        showRadius
          ? `Radio visual fijado en ${sanitizedKm} km`
          : `Radio visual desactivado para "${updated.name}"`
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al actualizar radio: ${getErrorMessage(err)}`);
    }
  };

  const openEditLocModal = (loc: CustomLocation) => {
    setEditingLoc(loc);
    setEditName(loc.name);
    setEditCity(loc.city);
    setEditGroupId(loc.group_id || '');
    setEditTimezone(loc.timezone || DEFAULT_TZ);
    setEditAltitude(loc.altitude ?? 25);
    setEditRadiusKm(loc.radius_km ?? 1.0);
    setEditShowRadius(loc.show_radius ?? true);
    setEditModalOpen(true);
  };

  const handleSaveEditLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoc) return;
    if (!editName.trim()) {
      toast.error('Ingresá un nombre para la ubicación');
      return;
    }
    setSavingEditLoc(true);
    try {
      const updated = await api.updateCustomLocation(editingLoc.id, {
        name: editName.trim(),
        city: editCity.trim() || undefined,
        group_id: editGroupId || undefined,
        timezone: editTimezone,
        altitude: Number(editAltitude) || 25,
        radius_km: Math.max(0.05, Math.min(500, Number(editRadiusKm) || 1.0)),
        show_radius: editShowRadius,
      });
      queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          locations: prev.locations.map((l) => (l.id === editingLoc.id ? { ...l, ...updated } : l)),
        };
      });
      toast.success(`Ubicación "${updated.name}" actualizada`);
      setEditModalOpen(false);
      setEditingLoc(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al editar ubicación: ${getErrorMessage(err)}`);
    } finally {
      setSavingEditLoc(false);
    }
  };

  const confirmDeleteLocation = async () => {
    if (!locToDelete) return;
    const { id, name } = locToDelete;
    try {
      await api.deleteCustomLocation(id);
      toast.success(`Ubicación "${name}" eliminada`);
      queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
        if (!prev) return prev;
        return { ...prev, locations: prev.locations.filter((l) => l.id !== id) };
      });
      if (selectedId === id) closeInspector();
      queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al eliminar ubicación: ${getErrorMessage(err)}`);
    } finally {
      setLocToDelete(null);
    }
  };

  const teleport = async () => {
    if (!sel || targets.length === 0) return;
    setTeleporting(true);
    const batch = [...targets];
    setJobs(Object.fromEntries(batch.map((t) => [t, 'running' as JobState])));
    let firstError = '';

    const results = await Promise.all(
      batch.map(async (name) => {
        try {
          await api.setInstanceLocation(name, {
            custom_location_id: sel.id,
            custom_name: sel.name,
            city: sel.city,
            latitude: sel.latitude,
            longitude: sel.longitude,
            altitude: sel.altitude,
            timezone: sel.timezone,
          });
          setJobs((j) => ({ ...j, [name]: 'ok' }));
          return true;
        } catch (err) {
          if (!firstError) firstError = getErrorMessage(err);
          setJobs((j) => ({ ...j, [name]: 'fail' }));
          return false;
        }
      })
    );

    const okCount = results.filter(Boolean).length;
    const failCount = results.length - okCount;
    if (okCount === 0) {
      toast.error(`No se pudo teletransportar: ${firstError || 'error desconocido'}`);
    } else {
      (failCount ? toast.warning : toast.success)(
        `"${sel.name}": ${okCount} teléfono${okCount > 1 ? 's' : ''} teletransportado${okCount > 1 ? 's' : ''}${
          failCount ? ` · ${failCount} fallo${failCount > 1 ? 's' : ''}` : ''
        }`
      );
    }
    setTargets([]);
    setTeleporting(false);
    onRefreshInstances?.();
  };

  const copyCoords = async (lat: number, lon: number) => {
    const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
      toast.success(`Coordenadas copiadas: ${text}`);
    } catch {
      toast.error('No se pudo acceder al portapapeles');
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupNameInput.trim()) {
      toast.error('Ingresá un nombre para el grupo');
      return;
    }
    setSavingGroup(true);
    try {
      if (editingGroup) {
        await api.updateLocationGroup(editingGroup.id, {
          name: groupNameInput.trim(),
          color: groupColorInput,
          description: groupDescInput.trim(),
        });
        toast.success(`Grupo "${groupNameInput}" actualizado`);
      } else {
        const created = await api.createLocationGroup({
          name: groupNameInput.trim(),
          color: groupColorInput,
          description: groupDescInput.trim(),
        });
        toast.success(`Grupo "${created.name}" creado`);
        if (!locGroupId) setLocGroupId(created.id);
      }
      setGroupModalOpen(false);
      setEditingGroup(null);
      setGroupNameInput('');
      setGroupDescInput('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al guardar grupo: ${getErrorMessage(err)}`);
    } finally {
      setSavingGroup(false);
    }
  };

  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return;
    const { id: groupId, name: groupName } = groupToDelete;
    try {
      await api.deleteLocationGroup(groupId);
      toast.success(`Grupo "${groupName}" eliminado`);
      if (selectedGroupId === groupId) changeSelectedGroupId(null);
      if (locGroupId === groupId) setLocGroupId('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al eliminar grupo: ${getErrorMessage(err)}`);
    } finally {
      setGroupToDelete(null);
    }
  };

  const openNewGroupModal = () => {
    setEditingGroup(null);
    setGroupNameInput('');
    setGroupColorInput('#10b981');
    setGroupDescInput('');
    setGroupModalOpen(true);
  };

  const openEditGroupModal = (g: LocationGroup) => {
    setEditingGroup(g);
    setGroupNameInput(g.name);
    setGroupColorInput(g.color || '#10b981');
    setGroupDescInput(g.description || '');
    setGroupModalOpen(true);
  };

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* CABECERA PRINCIPAL */}
      <header className="flex h-[55px] shrink-0 select-none items-center gap-4 border-b border-border bg-background px-4 py-2.5">
        <h1 className="flex items-center gap-2 font-mono text-base font-semibold text-foreground">
          <MapPin className="size-4 text-primary" /> Mapas y Ubicaciones
        </h1>
        <div className="ml-auto flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" /> {onlineCount}/{instances.length} online
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* SECCIÓN CENTRAL: BARRA + MAPA + FOOTER */}
        <section className="@container flex min-w-0 flex-1 flex-col border-r border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            {/* Buscador */}
            <div className="relative min-w-36 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchResults[0]) {
                    selectLocation(searchResults[0]);
                    searchInputRef.current?.blur();
                  }
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                    searchInputRef.current?.blur();
                  }
                }}
                placeholder="Buscar ubicación o ciudad…"
                className="h-8 w-full rounded-md border border-input bg-surface pl-8 pr-14 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded-sm text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground">
                  /
                </kbd>
              )}
            </div>

            {/* Segmented control */}
            <div className="flex shrink-0 rounded-md border border-border bg-surface p-0.5 text-xs">
              {(
                [
                  ['all', `Todas (${catalog.locations.length})`, Layers],
                  ['pinned', `Fijadas (${pinnedCount})`, Pin],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setScope(k)}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-2.5 py-1 font-mono transition-colors',
                    scope === k ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className={cn('size-3', scope === k && k === 'pinned' && 'fill-current text-primary')} />
                  {label}
                </button>
              ))}
            </div>

            {/* Popover Grupos */}
            <Popover
              open={groupsDropdownOpen}
              onOpenChange={(open) => {
                setGroupsDropdownOpen(open);
                if (open) setPinnedPopoverOpen(false);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    toolbarBtnClass,
                    'max-w-[200px]',
                    selectedGroup
                      ? 'border-primary/50 bg-primary/10 text-foreground'
                      : 'border-border bg-surface text-foreground hover:bg-surface-2'
                  )}
                  title="Ver, filtrar y gestionar grupos"
                >
                  {selectedGroup ? (
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: selectedGroup.color || '#10b981' }} />
                  ) : (
                    <Folder className="size-3.5 shrink-0 text-primary" />
                  )}
                  <span className="truncate">{selectedGroup ? selectedGroup.name : 'Grupos'}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {selectedGroup
                      ? catalog.locations.filter((l) => l.group_id === selectedGroup.id).length
                      : catalog.groups.length}
                  </span>
                  <ChevronDown className={cn('size-3 shrink-0 opacity-60 transition-transform', groupsDropdownOpen && 'rotate-180')} />
                </button>
              </PopoverTrigger>

              <PopoverContent align="end" sideOffset={6} className="w-80 space-y-1.5 p-2 font-mono shadow-pop">
                <div className="flex items-center justify-between border-b border-border px-1 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Layers className="size-3.5 text-primary" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                      Grupos ({catalog.groups.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setGroupsDropdownOpen(false);
                      openNewGroupModal();
                    }}
                    className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <Plus className="size-3" /> Nuevo grupo
                  </button>
                </div>

                {catalog.groups.length > 3 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Buscar grupo…"
                      value={groupFilterQuery}
                      onChange={(e) => setGroupFilterQuery(e.target.value)}
                      className="h-7 w-full rounded-sm border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    changeSelectedGroupId(null);
                    setGroupsDropdownOpen(false);
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors',
                    selectedGroupId === null
                      ? 'bg-primary/15 font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Layers className="size-3 text-muted-foreground" /> Todas las ubicaciones
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] opacity-70">
                    {catalog.locations.length}
                    {selectedGroupId === null && <Check className="size-3 text-primary" />}
                  </span>
                </button>

                <div className="max-h-56 space-y-0.5 overflow-y-auto pr-0.5">
                  {filteredDropdownGroups.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      {catalog.groups.length === 0
                        ? 'No hay grupos creados aún.'
                        : `Ningún grupo coincide con "${groupFilterQuery}".`}
                    </div>
                  ) : (
                    filteredDropdownGroups.map((group) => {
                      const count = catalog.locations.filter((l) => l.group_id === group.id).length;
                      const isSelected = selectedGroupId === group.id;
                      return (
                        <div
                          key={group.id}
                          className={cn(
                            'group/item flex items-center justify-between rounded-sm px-2 py-1 text-xs transition-colors',
                            isSelected ? 'bg-primary/15 font-semibold text-foreground' : 'text-foreground hover:bg-muted/60'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              changeSelectedGroupId(group.id);
                              setGroupsDropdownOpen(false);
                            }}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                            title={`Filtrar por ${group.name} (${count} ubicaciones)`}
                          >
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: group.color || '#10b981' }} />
                            <span className="truncate">{group.name}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">{count}</span>
                          </button>
                          <div className="ml-2 flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover/item:opacity-100">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setGroupsDropdownOpen(false);
                                openEditGroupModal(group);
                              }}
                              title={`Editar grupo "${group.name}"`}
                              className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                            >
                              <Edit2 className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setGroupsDropdownOpen(false);
                                setGroupToDelete(group);
                              }}
                              title={`Eliminar grupo "${group.name}"`}
                              className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Popover Accesos Rápidos */}
            <Popover
              open={pinnedPopoverOpen}
              onOpenChange={(open) => {
                setPinnedPopoverOpen(open);
                if (open) setGroupsDropdownOpen(false);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    toolbarBtnClass,
                    'border-border bg-surface hover:bg-surface-2',
                    combinedPinnedItems.length > 0 ? 'text-foreground' : 'text-muted-foreground'
                  )}
                  title="Accesos rápidos fijados en FocusView"
                >
                  <Pin className={cn('size-3.5', combinedPinnedItems.length > 0 ? 'fill-current text-primary' : '')} />
                  <span className="hidden @5xl:inline">Accesos rápidos</span>
                  <span className="text-[10px] text-muted-foreground">{combinedPinnedItems.length}</span>
                  <ChevronDown className={cn('size-3 shrink-0 opacity-60 transition-transform', pinnedPopoverOpen && 'rotate-180')} />
                </button>
              </PopoverTrigger>

              <PopoverContent align="end" sideOffset={6} className="w-80 space-y-1.5 p-2 font-mono shadow-pop">
                <div className="flex items-center justify-between border-b border-border px-1 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Pin className="size-3.5 fill-current text-primary" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                      Accesos rápidos ({combinedPinnedItems.length})
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">FocusView</span>
                </div>

                {combinedPinnedItems.length > 3 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Buscar acceso rápido…"
                      value={pinnedSearchQuery}
                      onChange={(e) => setPinnedSearchQuery(e.target.value)}
                      className="h-7 w-full rounded-sm border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary"
                    />
                  </div>
                )}

                <div className="max-h-56 space-y-0.5 overflow-y-auto pr-0.5">
                  {filteredPinnedList.length === 0 ? (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                      {combinedPinnedItems.length === 0
                        ? 'No hay accesos rápidos. Activá "Fijar en accesos rápidos" en el panel de una ubicación.'
                        : `Ningún acceso rápido coincide con "${pinnedSearchQuery}".`}
                    </div>
                  ) : (
                    filteredPinnedList.map((item) => (
                      <div
                        key={`${item.type}-${item.id}`}
                        className="flex items-center justify-between rounded-sm px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/60"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const custom = item.type === 'custom' ? catalog.locations.find((l) => l.id === item.id) : undefined;
                            if (custom) {
                              selectLocation(custom);
                            } else {
                              setMapCity(item.city);
                              if (item.timezone) setLocTimezone(item.timezone);
                              if (item.altitude) setLocAltitude(item.altitude);
                              mapHandleRef.current?.flyTo(item.latitude, item.longitude);
                            }
                            toast.info(`Centrado en: ${item.name}`);
                            setPinnedPopoverOpen(false);
                          }}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                          title={`Centrar en mapa: ${item.name} (${item.city})`}
                        >
                          {item.type === 'custom' ? (
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.groupColor || '#10b981' }} />
                          ) : (
                            <Globe className="size-3 shrink-0 text-primary" />
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{item.name}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">{item.city}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePin(item.type, item.id, false)}
                          title={`Desfijar ${item.name} de FocusView`}
                          className="ml-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-border px-1 pt-1.5 text-[10px] text-muted-foreground">
                  Aparecen como accesos directos en la barra GPS de FocusView.
                </div>
              </PopoverContent>
            </Popover>

            {/* Botón global mostrar/ocultar radios */}
            <button
              type="button"
              onClick={() => setShowAllRadii((v) => !v)}
              className={cn(
                toolbarBtnClass,
                showAllRadii
                  ? 'border-primary/50 bg-primary/10 text-foreground font-semibold'
                  : 'border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground'
              )}
              title={showAllRadii ? 'Ocultar todos los radios de referencia en el mapa' : 'Mostrar radios de referencia en el mapa'}
            >
              <CircleDot className={cn('size-3.5 shrink-0', showAllRadii ? 'text-primary' : 'text-muted-foreground')} />
              <span className="hidden @4xl:inline">Radios</span>
              <span className={cn('text-[10px] font-mono', showAllRadii ? 'text-primary' : 'text-muted-foreground/70')}>
                {showAllRadii ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* Botón principal */}
            <button
              type="button"
              onClick={() => startCreate()}
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" />
              <span className="@3xl:hidden">Nueva</span>
              <span className="hidden @3xl:inline">Nueva ubicación</span>
            </button>
          </div>

          {/* MAPA HERO */}
          <LocationsMapHero
            ref={mapHandleRef}
            mapLat={mapLat}
            mapLon={mapLon}
            mapCity={mapCity}
            creating={creating}
            showAllRadii={showAllRadii}
            setShowAllRadii={setShowAllRadii}
            locRadiusKm={locRadiusKm}
            locShowRadius={locShowRadius}
            markers={markers}
            selectedId={selectedId}
            onMarkerClick={handleMarkerClick}
            onMapChange={handleMapChange}
            searchFocused={searchFocused}
            normalizedQuery={normalizedQuery}
            searchQuery={searchQuery}
            searchResults={searchResults}
            visibleLocationsCount={visibleLocations.length}
            catalogTotalCount={catalog.locations.length}
            groupsMap={groupsMap}
            onSelectLocation={selectLocation}
            onSearchInputBlur={() => searchInputRef.current?.blur()}
            filtersActive={filtersActive}
            onClearFilters={clearFilters}
            defaultLoc={defaultLoc}
            onCenterOnDefault={centerOnDefault}
            onCancelCreate={cancelCreate}
            loading={loading}
            onStartCreate={startCreate}
          />

          {/* FOOTER MÉTRICAS */}
          <footer className="flex h-9 shrink-0 select-none items-center justify-between gap-4 border-t border-border px-4 font-mono text-xs text-muted-foreground">
            <span className="truncate">
              {catalog.locations.length} ubicaciones guardadas <span className="opacity-50">•</span> {catalog.groups.length} grupos{' '}
              <span className="opacity-50">•</span> {geolocatedCount}/{instances.length} teléfonos geolocalizados
            </span>
            {defaultLoc && (
              <button
                type="button"
                onClick={centerOnDefault}
                title="Centrar el mapa en la ubicación predeterminada"
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
              >
                <Star className="size-3 fill-current text-warning" />
                <span className="max-w-40 truncate">{defaultLoc.name}</span>
              </button>
            )}
          </footer>
        </section>

        {/* ASIDE INSPECTOR */}
        <LocationsInspector
          creating={creating}
          sel={sel}
          defaultLoc={defaultLoc}
          catalog={catalog}
          groupsMap={groupsMap}
          phonesByLocation={phonesByLocation}
          visibleLocations={visibleLocations}
          loading={loading}
          mapLat={mapLat}
          mapLon={mapLon}
          mapCity={mapCity}
          setMapCity={setMapCity}
          locName={locName}
          setLocName={setLocName}
          locGroupId={locGroupId}
          setLocGroupId={setLocGroupId}
          locTimezone={locTimezone}
          setLocTimezone={setLocTimezone}
          locAltitude={locAltitude}
          setLocAltitude={setLocAltitude}
          locIsPinned={locIsPinned}
          setLocIsPinned={setLocIsPinned}
          locSetAsDefault={locSetAsDefault}
          setLocSetAsDefault={setLocSetAsDefault}
          locShowRadius={locShowRadius}
          setLocShowRadius={setLocShowRadius}
          locRadiusKm={locRadiusKm}
          setLocRadiusKm={setLocRadiusKm}
          savingLoc={savingLoc}
          formGroupSelectOpen={formGroupSelectOpen}
          setFormGroupSelectOpen={setFormGroupSelectOpen}
          onSaveLocation={handleSaveLocation}
          onCancelCreate={cancelCreate}
          onOpenNewGroupModal={openNewGroupModal}
          selColor={selColor}
          selGroup={selGroup}
          selIsDefault={selIsDefault}
          copied={copied}
          onOpenEditLocModal={openEditLocModal}
          onPromptDeleteLocation={(loc) => setLocToDelete(loc)}
          onCloseInspector={closeInspector}
          onCopyCoords={copyCoords}
          onSetDefaultLocation={handleSetDefaultLocation}
          onTogglePin={handleTogglePin}
          onUpdateLocationRadius={handleUpdateLocationRadius}
          instances={instances}
          targets={targets}
          setTargets={setTargets}
          teleporting={teleporting}
          jobs={jobs}
          onTeleport={teleport}
          onResetTeleport={resetTeleport}
          onCenterOnDefault={centerOnDefault}
          onClearFilters={clearFilters}
          onSelectLocation={selectLocation}
          onHighlightLocation={(id) => mapHandleRef.current?.highlight(id)}
        />
      </div>

      {/* DIÁLOGO CREAR / EDITAR GRUPO */}
      <LocationGroupModal
        open={groupModalOpen}
        onOpenChange={(o) => {
          setGroupModalOpen(o);
          if (!o) setEditingGroup(null);
        }}
        editingGroup={editingGroup}
        groupNameInput={groupNameInput}
        setGroupNameInput={setGroupNameInput}
        groupColorInput={groupColorInput}
        setGroupColorInput={setGroupColorInput}
        groupDescInput={groupDescInput}
        setGroupDescInput={setGroupDescInput}
        savingGroup={savingGroup}
        onSaveGroup={handleSaveGroup}
      />

      {/* CONFIRMAR ELIMINACIÓN DE UBICACIÓN */}
      <AlertDialog open={!!locToDelete} onOpenChange={(o) => !o && setLocToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{locToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra del catálogo y de los accesos rápidos. Los CloudPhones que ya la tienen asignada conservan sus
              coordenadas actuales.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteLocation}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DIÁLOGO EDITAR UBICACIÓN */}
      <Dialog
        open={editModalOpen}
        onOpenChange={(o) => {
          setEditModalOpen(o);
          if (!o) setEditingLoc(null);
        }}
      >
        <DialogContent className="max-w-md gap-0 p-0">
          <DialogHeader className="border-b border-border p-4 pr-10">
            <DialogTitle className="flex items-center gap-2 font-mono text-sm">
              <Edit2 className="size-4 text-primary" />
              Editar ubicación
            </DialogTitle>
            <DialogDescription className="text-xs">
              Modificá el nombre, grupo, ciudad o el radio de influencia visual en el mapa.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEditLocation} className="space-y-3 p-4">
            <div>
              <label className={fieldLabelClass} htmlFor="edit-name">
                Nombre de la ubicación *
              </label>
              <input
                id="edit-name"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={fieldLabelClass}>Grupo</span>
                <Popover open={editGroupSelectOpen} onOpenChange={setEditGroupSelectOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(fieldClass, 'flex cursor-pointer items-center justify-between gap-1.5 hover:bg-muted/40')}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {editGroupId ? (
                          <>
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: groupsMap.get(editGroupId)?.color || '#10b981' }}
                            />
                            <span className="truncate font-medium">{groupsMap.get(editGroupId)?.name}</span>
                          </>
                        ) : (
                          <span className="font-mono text-[11px] text-muted-foreground">Sin grupo</span>
                        )}
                      </span>
                      <ChevronDown className={cn('size-3 shrink-0 opacity-60 transition-transform', editGroupSelectOpen && 'rotate-180')} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={4} className="w-56 space-y-0.5 p-1 font-mono">
                    <button
                      type="button"
                      onClick={() => {
                        setEditGroupId('');
                        setEditGroupSelectOpen(false);
                      }}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs transition-colors',
                        editGroupId === '' ? 'bg-primary/15 font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      Sin grupo
                    </button>
                    <div className="max-h-48 space-y-0.5 overflow-y-auto">
                      {catalog.groups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setEditGroupId(g.id);
                            setEditGroupSelectOpen(false);
                          }}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors',
                            editGroupId === g.id ? 'bg-primary/15 font-semibold text-foreground' : 'text-foreground hover:bg-muted'
                          )}
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: g.color || '#10b981' }} />
                          <span className="flex-1 truncate">{g.name}</span>
                          {editGroupId === g.id && <Check className="size-3 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className={fieldLabelClass} htmlFor="edit-city">
                  Ciudad / referencia
                </label>
                <input
                  id="edit-city"
                  type="text"
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_96px] gap-2">
              <div>
                <label className={fieldLabelClass} htmlFor="edit-tz">
                  Zona horaria
                </label>
                <input
                  id="edit-tz"
                  type="text"
                  value={editTimezone}
                  onChange={(e) => setEditTimezone(e.target.value)}
                  className={cn(fieldClass, 'font-mono text-[11px]')}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="edit-alt">
                  Altitud (m)
                </label>
                <input
                  id="edit-alt"
                  type="number"
                  value={editAltitude}
                  onChange={(e) => setEditAltitude(Number(e.target.value))}
                  className={cn(fieldClass, 'font-mono text-[11px] tabular-nums')}
                />
              </div>
            </div>

            <div className="rounded-md border border-border bg-card p-2.5 space-y-2">
              <div className="flex items-center gap-3">
                <CircleDot className={cn('size-4 shrink-0', editShowRadius ? 'text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Radio de referencia</div>
                  <div className="text-xs text-muted-foreground">
                    {editShowRadius ? `Visible en el mapa (${editRadiusKm} km)` : 'Oculto en el mapa'}
                  </div>
                </div>
                <Switch checked={editShowRadius} onCheckedChange={setEditShowRadius} />
              </div>

              {editShowRadius && (
                <div className="pt-2 border-t border-border/60 space-y-2 animate-in fade-in-0 duration-150">
                  <div className="flex items-center justify-between">
                    <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground" htmlFor="edit-radius-input">
                      Alcance del radio (km)
                    </label>
                    <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                      {editRadiusKm} km
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="edit-radius-input"
                      type="number"
                      min={0.1}
                      max={500}
                      step={0.1}
                      value={editRadiusKm}
                      onChange={(e) => setEditRadiusKm(Math.max(0.1, Number(e.target.value) || 1.0))}
                      className={cn(fieldClass, 'font-mono text-xs tabular-nums')}
                    />
                    <span className="font-mono text-xs text-muted-foreground shrink-0">km</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[0.5, 1, 2, 5, 10, 25].map((presetKm) => (
                      <button
                        key={presetKm}
                        type="button"
                        onClick={() => setEditRadiusKm(presetKm)}
                        className={cn(
                          'rounded border px-2 py-0.5 font-mono text-[10px] transition-colors cursor-pointer',
                          editRadiusKm === presetKm
                            ? 'border-primary/50 bg-primary/20 text-primary font-semibold'
                            : 'border-border bg-background text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                        )}
                      >
                        {presetKm} km
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="h-8 cursor-pointer rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEditLoc || !editName.trim()}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingEditLoc && <Loader2 className="size-3.5 animate-spin" />}
                Guardar cambios
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* CONFIRMAR ELIMINACIÓN DE GRUPO */}
      <AlertDialog open={!!groupToDelete} onOpenChange={(o) => !o && setGroupToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el grupo "{groupToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Las ubicaciones dentro de este grupo no se borran: quedan sin grupo asignado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteGroup}>
              Eliminar grupo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
