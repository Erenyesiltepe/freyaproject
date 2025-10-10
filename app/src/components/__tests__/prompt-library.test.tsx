import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PromptLibrary } from '@/components/prompt-library';

// Mock the queries
jest.mock('@/lib/queries', () => ({
  usePrompts: jest.fn(),
  useCreatePrompt: jest.fn(),
}));

// Mock fetch for delete operations
global.fetch = jest.fn();

import { usePrompts, useCreatePrompt } from '@/lib/queries';

const mockUsePrompts = usePrompts as jest.MockedFunction<typeof usePrompts>;
const mockUseCreatePrompt = useCreatePrompt as jest.MockedFunction<typeof useCreatePrompt>;
const mockFetch = global.fetch as jest.MockedFunction<typeof global.fetch>;

describe('PromptLibrary', () => {
  const mockPrompts = [
    {
      id: 'prompt-1',
      title: 'Test Prompt 1',
      body: 'This is the first test prompt',
      tags: ['tag1', 'tag2'],
      version: 1,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    },
    {
      id: 'prompt-2',
      title: 'Test Prompt 2',
      body: 'This is the second test prompt',
      tags: ['tag2', 'tag3'],
      version: 2,
      createdAt: '2023-01-02T00:00:00Z',
      updatedAt: '2023-01-02T00:00:00Z',
    },
  ];

  const mockCreatePrompt = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePrompts.mockReturnValue({
      data: { prompts: mockPrompts },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as any);
    mockUseCreatePrompt.mockReturnValue({
      mutateAsync: mockCreatePrompt,
      isPending: false,
    } as any);
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    } as any);
  });

  it('renders prompts correctly', () => {
    render(<PromptLibrary />);

    expect(screen.getByText('Test Prompt 1')).toBeInTheDocument();
    expect(screen.getByText('Test Prompt 2')).toBeInTheDocument();
    expect(screen.getByText('This is the first test prompt')).toBeInTheDocument();
    expect(screen.getByText('This is the second test prompt')).toBeInTheDocument();
  });

  it('displays tags for each prompt', () => {
    render(<PromptLibrary />);

    // Check that tags are displayed in the prompt cards (not the filter buttons)
    const tagElements = screen.getAllByText('tag1');
    expect(tagElements.length).toBeGreaterThan(1); // Should have both filter button and tag display
    
    const tag2Elements = screen.getAllByText('tag2');
    expect(tag2Elements.length).toBeGreaterThan(1);
    
    const tag3Elements = screen.getAllByText('tag3');
    expect(tag3Elements.length).toBeGreaterThan(0);
  });

  it('shows search input and tag filter buttons', () => {
    render(<PromptLibrary />);

    expect(screen.getByPlaceholderText('Search prompts...')).toBeInTheDocument();
    
    // Check that filter buttons exist (they should be buttons, not spans)
    const tag1Buttons = screen.getAllByRole('button', { name: 'tag1' });
    expect(tag1Buttons.length).toBe(1);
    
    const tag2Buttons = screen.getAllByRole('button', { name: 'tag2' });
    expect(tag2Buttons.length).toBe(1);
    
    const tag3Buttons = screen.getAllByRole('button', { name: 'tag3' });
    expect(tag3Buttons.length).toBe(1);
  });

  it('filters prompts by search text', async () => {
    const user = userEvent.setup();
    render(<PromptLibrary />);

    const searchInput = screen.getByPlaceholderText('Search prompts...');
    await user.type(searchInput, 'first');

    expect(screen.getByText('Test Prompt 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Prompt 2')).not.toBeInTheDocument();
  });

  it('filters prompts by selected tags', async () => {
    const user = userEvent.setup();
    render(<PromptLibrary />);

    const tag1Button = screen.getAllByText('tag1')[0]; // First occurrence is the filter button
    await user.click(tag1Button);

    expect(screen.getByText('Test Prompt 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Prompt 2')).not.toBeInTheDocument();
  });

  it('shows create prompt form when Create New Prompt is clicked', async () => {
    const user = userEvent.setup();
    render(<PromptLibrary />);

    const createButton = screen.getByText('Create New Prompt');
    await user.click(createButton);

    expect(screen.getByText('New Prompt')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Prompt title')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Prompt body')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tags (comma separated)')).toBeInTheDocument();
  });

  it('creates a new prompt successfully', async () => {
    const user = userEvent.setup();
    mockCreatePrompt.mockResolvedValue({
      prompt: {
        id: 'prompt-3',
        title: 'New Prompt',
        body: 'New prompt body',
        tags: ['new-tag'],
        version: 1,
        createdAt: '2023-01-03T00:00:00Z',
        updatedAt: '2023-01-03T00:00:00Z',
      },
    });

    render(<PromptLibrary />);

    // Open create form
    const createButton = screen.getByText('Create New Prompt');
    await user.click(createButton);

    // Fill form
    const titleInput = screen.getByPlaceholderText('Prompt title');
    const bodyTextarea = screen.getByPlaceholderText('Prompt body');
    const tagsInput = screen.getByPlaceholderText('Tags (comma separated)');

    await user.type(titleInput, 'New Prompt');
    await user.type(bodyTextarea, 'New prompt body');
    await user.type(tagsInput, 'new-tag, another-tag');

    // Submit form
    const submitButton = screen.getByText('Create');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreatePrompt).toHaveBeenCalledWith({
        title: 'New Prompt',
        body: 'New prompt body',
        tags: ['new-tag', 'another-tag'],
      });
    });
  });

  it('shows loading state', () => {
    mockUsePrompts.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    } as any);

    render(<PromptLibrary />);

    // Should still render the component structure even when loading
    expect(screen.getByPlaceholderText('Search prompts...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockUsePrompts.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed to load prompts'),
      refetch: jest.fn(),
    } as any);

    render(<PromptLibrary />);

    // Component should still render even with error
    expect(screen.getByPlaceholderText('Search prompts...')).toBeInTheDocument();
  });

  it('calls onStartSession when Start Session button is clicked', async () => {
    const user = userEvent.setup();
    const mockOnStartSession = jest.fn();

    render(<PromptLibrary onStartSession={mockOnStartSession} />);

    const startSessionButton = screen.getAllByText('Start Session')[0];
    await user.click(startSessionButton);

    expect(mockOnStartSession).toHaveBeenCalledWith('prompt-1');
  });

  it('deletes a prompt successfully', async () => {
    const user = userEvent.setup();
    const mockRefetch = jest.fn();

    mockUsePrompts.mockReturnValue({
      data: { prompts: mockPrompts },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    render(<PromptLibrary />);

    const deleteButton = screen.getAllByText('Delete')[0];
    await user.click(deleteButton);

    expect(mockFetch).toHaveBeenCalledWith('/api/prompts/prompt-1', {
      method: 'DELETE',
    });
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('starts editing a prompt', async () => {
    const user = userEvent.setup();
    render(<PromptLibrary />);

    const editButton = screen.getAllByText('Edit')[0];
    await user.click(editButton);

    expect(screen.getByText('Edit Prompt')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Prompt 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('This is the first test prompt')).toBeInTheDocument();
    expect(screen.getByDisplayValue('tag1, tag2')).toBeInTheDocument();
  });

  it('cancels form creation', async () => {
    const user = userEvent.setup();
    render(<PromptLibrary />);

    // Open create form
    const createButton = screen.getByText('Create New Prompt');
    await user.click(createButton);

    // Cancel
    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(screen.queryByText('New Prompt')).not.toBeInTheDocument();
  });

  it('handles empty tags gracefully', async () => {
    const user = userEvent.setup();
    mockCreatePrompt.mockResolvedValue({
      prompt: {
        id: 'prompt-3',
        title: 'New Prompt',
        body: 'New prompt body',
        tags: [],
        version: 1,
        createdAt: '2023-01-03T00:00:00Z',
        updatedAt: '2023-01-03T00:00:00Z',
      },
    });

    render(<PromptLibrary />);

    // Open create form
    const createButton = screen.getByText('Create New Prompt');
    await user.click(createButton);

    // Fill form with empty tags
    const titleInput = screen.getByPlaceholderText('Prompt title');
    const bodyTextarea = screen.getByPlaceholderText('Prompt body');

    await user.type(titleInput, 'New Prompt');
    await user.type(bodyTextarea, 'New prompt body');

    // Submit form
    const submitButton = screen.getByText('Create');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreatePrompt).toHaveBeenCalledWith({
        title: 'New Prompt',
        body: 'New prompt body',
        tags: [],
      });
    });
  });
});