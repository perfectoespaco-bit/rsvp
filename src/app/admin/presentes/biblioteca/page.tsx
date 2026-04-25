'use client'

import { useState, useEffect } from 'react'
import { LIBRARY_SECTIONS, COLLECTIONS } from '@/lib/gift-templates'
import { ChevronLeft, Save, Power, LayoutGrid, List } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function AdminGiftLibraryPage() {
  const router = useRouter()
  const [config, setConfig] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/admin/gift-library/config')
        const data = await res.json()
        const configMap: Record<string, boolean> = {}
        data.forEach((item: any) => {
          configMap[item.id] = item.is_enabled
        })
        setConfig(configMap)
      } catch (e) {
        toast.error('Erro ao carregar configurações')
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    setSaving(id)
    try {
      const newStatus = !currentStatus
      const res = await fetch('/api/admin/gift-library/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_enabled: newStatus })
      })

      if (res.ok) {
        setConfig(prev => ({ ...prev, [id]: newStatus }))
        toast.success('Status atualizado com sucesso')
      } else {
        throw new Error()
      }
    } catch (e) {
      toast.error('Erro ao atualizar status')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-light flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-light pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-border-soft px-6 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full border border-border-soft flex items-center justify-center hover:bg-bg-light transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-serif text-text-primary tracking-tight">Gerenciar Biblioteca</h1>
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Habilite ou desabilite listas e grupos</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        
        {/* 1. GRUPOS (SECTIONS) */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-brand pl-4">
            <LayoutGrid className="text-brand" size={20} />
            <h2 className="text-xl font-serif text-text-primary">Grupos de Listas</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {LIBRARY_SECTIONS.map(section => {
              const id = `section:${section.id}`
              const isEnabled = config[id] !== false
              const isProcessing = saving === id

              return (
                <div key={section.id} className="bg-white p-6 rounded-3xl border border-border-soft flex items-center justify-between shadow-sm hover:shadow-md transition-all">
                  <div className="flex-1">
                    <h3 className="font-black text-sm text-text-primary uppercase tracking-tight">{section.title}</h3>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">{section.description}</p>
                  </div>
                  <button
                    onClick={() => toggleStatus(id, isEnabled)}
                    disabled={isProcessing}
                    className={`ml-6 w-14 h-8 rounded-full transition-all relative flex items-center px-1 ${
                      isEnabled ? 'bg-emerald-500' : 'bg-slate-200'
                    } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-all transform ${
                      isEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        {/* 2. LISTAS INDIVIDUAIS (COLLECTIONS) */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-brand pl-4">
            <List className="text-brand" size={20} />
            <h2 className="text-xl font-serif text-text-primary">Listas Individuais</h2>
          </div>

          <div className="space-y-8">
            {LIBRARY_SECTIONS.map(section => {
              const sectionCollections = COLLECTIONS.filter(c => c.category === section.id)
              if (sectionCollections.length === 0) return null

              return (
                <div key={section.id} className="space-y-4">
                  <h4 className="text-[10px] font-black text-brand uppercase tracking-[0.2em]">{section.title}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sectionCollections.map(col => {
                      const id = `collection:${col.id}`
                      const isParentEnabled = config[`section:${section.id}`] !== false
                      const isIndividualEnabled = config[id] !== false
                      const isEnabled = isIndividualEnabled && isParentEnabled
                      const isProcessing = saving === id

                      return (
                        <div key={col.id} className={`bg-white p-4 rounded-2xl border transition-all flex items-center justify-between shadow-sm ${
                          !isParentEnabled ? 'opacity-60 bg-bg-light/50 border-dashed' : 'border-border-soft'
                        }`}>
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-10 h-10 rounded-xl bg-bg-light overflow-hidden flex-shrink-0 grayscale-[0.5]">
                                <img src={col.coverImage} className="w-full h-full object-cover" alt="" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-xs text-text-primary truncate pr-2">{col.name}</span>
                              {!isParentEnabled && isIndividualEnabled && (
                                <span className="text-[8px] font-black text-amber-600 uppercase tracking-tight">Oculto pelo Grupo</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => isParentEnabled && toggleStatus(id, isIndividualEnabled)}
                            disabled={isProcessing || !isParentEnabled}
                            className={`w-10 h-6 rounded-full transition-all relative flex items-center px-1 ${
                              isEnabled ? 'bg-emerald-500' : 'bg-slate-200'
                            } ${isProcessing || !isParentEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-all transform ${
                              isEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
