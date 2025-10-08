'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Prompt {
  id: string; // Changed from number to string
  title: string;
  body: string;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface PromptLibraryProps {
  onStartSession?: (promptId: string) => void;
}

export function PromptLibrary({ onStartSession }: PromptLibraryProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [newPrompt, setNewPrompt] = useState({ title: '', body: '', tags: '' });

  const loadPrompts = async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));

    console.log('Loading prompts with params:', params.toString());

    try {
      const response = await fetch(`/api/prompts?${params}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Loaded prompts:', data.prompts.length);
        setPrompts(data.prompts);
      } else {
        console.error('Failed to load prompts:', response.status);
      }
    } catch (error) {
      console.error('Error loading prompts:', error);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadPrompts();
    }, 300); // Debounce search by 300ms

    return () => clearTimeout(timeoutId);
  }, [search, selectedTags]);

  const handleCreatePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    const tags = newPrompt.tags.split(',').map(tag => tag.trim()).filter(Boolean);
    
    const response = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newPrompt.title,
        body: newPrompt.body,
        tags,
      }),
    });

    if (response.ok) {
      setNewPrompt({ title: '', body: '', tags: '' });
      setIsCreating(false);
      loadPrompts();
    }
  };

  const handleUpdatePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrompt) return;

    const tags = newPrompt.tags.split(',').map(tag => tag.trim()).filter(Boolean);
    
    const response = await fetch(`/api/prompts/${editingPrompt.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newPrompt.title,
        body: newPrompt.body,
        tags,
      }),
    });

    if (response.ok) {
      setEditingPrompt(null);
      setNewPrompt({ title: '', body: '', tags: '' });
      loadPrompts();
    }
  };

  const handleDeletePrompt = async (id: string) => {
    const response = await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
    if (response.ok) {
      loadPrompts();
    }
  };

  const startEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setNewPrompt({
      title: prompt.title,
      body: prompt.body,
      tags: prompt.tags.join(', '),
    });
    setIsCreating(true);
  };

  const allTags = [...new Set(prompts.flatMap(p => p.tags))];

  return (
    <div className="w-full max-w-2xl p-4">
      <div className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="Search prompts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
        />
        
        <div className="flex flex-wrap gap-2">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => {
                setSelectedTags(prev => 
                  prev.includes(tag) 
                    ? prev.filter(t => t !== tag)
                    : [...prev, tag]
                );
              }}
              className={`px-2 py-1 rounded text-sm ${
                selectedTags.includes(tag)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={() => setIsCreating(true)} className="mb-4">
        Create New Prompt
      </Button>

      {isCreating && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{editingPrompt ? 'Edit Prompt' : 'New Prompt'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={editingPrompt ? handleUpdatePrompt : handleCreatePrompt} className="space-y-4">
              <input
                type="text"
                placeholder="Prompt title"
                value={newPrompt.title}
                onChange={(e) => setNewPrompt(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                required
              />
              <textarea
                placeholder="Prompt body"
                value={newPrompt.body}
                onChange={(e) => setNewPrompt(prev => ({ ...prev, body: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                required
              />
              <input
                type="text"
                placeholder="Tags (comma separated)"
                value={newPrompt.tags}
                onChange={(e) => setNewPrompt(prev => ({ ...prev, tags: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              />
              <div className="flex gap-2">
                <Button type="submit">
                  {editingPrompt ? 'Update' : 'Create'}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsCreating(false);
                    setEditingPrompt(null);
                    setNewPrompt({ title: '', body: '', tags: '' });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {prompts.map(prompt => (
          <Card key={prompt.id}>
            <CardHeader>
              <CardTitle className="flex justify-between items-start">
                <span>{prompt.title}</span>
                <div className="flex gap-2">
                  {onStartSession && (
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={() => onStartSession(prompt.id)}
                    >
                      Start Session
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => startEdit(prompt)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDeletePrompt(prompt.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300 mb-2">{prompt.body}</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {prompt.tags.map(tag => (
                  <span 
                    key={tag}
                    className="px-2 py-1 bg-gray-200 dark:bg-slate-700 text-xs rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500">v{prompt.version} • {new Date(prompt.updatedAt).toLocaleDateString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}