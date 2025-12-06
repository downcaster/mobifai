import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { codeService } from '../services/CodeService';
import { CodeProject, FileNode } from '../types/code';

/**
 * Hook to fetch projects history
 */
export function useProjectsHistory() {
  return useQuery<CodeProject[], Error>({
    queryKey: ['projects'],
    queryFn: () => codeService.getProjectsHistory(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch folder children
 */
export function useFolderChildren(folderPath: string | null) {
  return useQuery<FileNode[], Error>({
    queryKey: ['folder', folderPath],
    queryFn: () => {
      if (!folderPath) throw new Error('Folder path is required');
      return codeService.getFolderChildren(folderPath);
    },
    enabled: !!folderPath,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

/**
 * Hook to fetch file content
 * Always refetches - no caching to ensure latest content
 */
export function useFileContent(filePath: string | null, projectPath?: string) {
  return useQuery<string, Error>({
    queryKey: ['file', filePath],
    queryFn: () => {
      if (!filePath) throw new Error('File path is required');
      return codeService.getFile(filePath, projectPath);
    },
    enabled: !!filePath,
    staleTime: 0, // Always consider stale - refetch every time
    gcTime: 0, // Don't cache at all
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to save file with optimistic update
 */
export function useSaveFile() {
  const queryClient = useQueryClient();

  return useMutation<
    boolean,
    Error,
    { filePath: string; content: string },
    { previousContent: string | undefined; filePath: string }
  >({
    mutationFn: ({ filePath, content }) => codeService.saveFile(filePath, content),
    onMutate: async ({ filePath, content }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['file', filePath] });

      // Snapshot the previous value
      const previousContent = queryClient.getQueryData<string>(['file', filePath]);

      // Optimistically update to the new value
      queryClient.setQueryData(['file', filePath], content);

      // Return context with snapshot
      return { previousContent, filePath };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousContent) {
        queryClient.setQueryData(['file', context.filePath], context.previousContent);
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch on success (optional)
      queryClient.invalidateQueries({ queryKey: ['file', variables.filePath] });
    },
  });
}

/**
 * Hook to initialize a project
 */
export function useInitProject() {
  const queryClient = useQueryClient();

  return useMutation<{ rootPath: string; children: FileNode[] }, Error, string>({
    mutationFn: (projectPath: string) => codeService.initProject(projectPath),
    onSuccess: (data) => {
      // Cache the root folder children
      queryClient.setQueryData(['folder', data.rootPath], data.children);
    },
  });
}

/**
 * Prefetch folder children
 */
export function usePrefetchFolder(queryClient: QueryClient) {
  return (folderPath: string) => {
    queryClient.prefetchQuery({
      queryKey: ['folder', folderPath],
      queryFn: () => codeService.getFolderChildren(folderPath),
      staleTime: 1000 * 60 * 10,
    });
  };
}

/**
 * Invalidate all code queries
 */
export function useInvalidateCodeQueries() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['folder'] });
      queryClient.invalidateQueries({ queryKey: ['file'] });
    },
    invalidateProject: (projectPath: string) => {
      // Invalidate all folders and files under this project
      queryClient.invalidateQueries({
        queryKey: ['folder'],
        predicate: (query) => {
          const path = query.queryKey[1] as string;
          return path?.startsWith(projectPath);
        },
      });
      queryClient.invalidateQueries({
        queryKey: ['file'],
        predicate: (query) => {
          const path = query.queryKey[1] as string;
          return path?.startsWith(projectPath);
        },
      });
    },
  };
}

