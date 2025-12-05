import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Text,
} from 'react-native';
import { CodeProject } from '../../types/code';
import { useProjectsHistory } from '../../hooks/useCodeQueries';

// Dark theme colors (matching terminal)
const darkTheme = {
  background: '#0a0a0f',
  surface: '#12121a',
  surfaceElevated: '#1a1a25',
  border: '#2a2a3a',
  primary: '#6200EE',
  primaryLight: '#BB86FC',
  secondary: '#03DAC6',
  text: {
    primary: '#ffffff',
    secondary: '#8888aa',
    disabled: '#555566',
  },
  error: '#CF6679',
};

interface ProjectsListProps {
  onProjectSelect: (project: CodeProject) => void;
  selectedProject?: string | null;
}

export function ProjectsList({
  onProjectSelect,
  selectedProject,
}: ProjectsListProps): React.ReactElement {
  const { data: projects, isLoading, error, refetch } = useProjectsHistory();

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={darkTheme.primaryLight} />
        <Text style={styles.loadingText}>Loading projects...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load projects</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>📂</Text>
        <Text style={styles.emptyText}>No projects yet</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={true}>
      {projects.map((project) => {
        const isSelected = selectedProject === project.path;
        const lastOpenedDate = new Date(project.lastOpened);
        const timeAgo = getTimeAgo(lastOpenedDate);

        return (
          <TouchableOpacity
            key={project.path}
            onPress={() => onProjectSelect(project)}
            activeOpacity={0.7}
            style={[styles.projectCard, isSelected && styles.projectCardSelected]}
          >
            <View style={styles.projectIconContainer}>
              <Text style={styles.projectIcon}>📂</Text>
            </View>
            <View style={styles.projectInfo}>
              <Text
                style={[
                  styles.projectName,
                  isSelected && styles.projectNameSelected,
                ]}
                numberOfLines={1}
              >
                {project.name}
              </Text>
              <Text style={styles.projectPath} numberOfLines={1}>
                {project.path}
              </Text>
            </View>
            <Text style={styles.projectTime}>{timeAgo}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function getTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'Now';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: darkTheme.background,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    backgroundColor: darkTheme.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  projectCardSelected: {
    borderColor: darkTheme.primary,
    borderWidth: 1.5,
  },
  projectIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: darkTheme.primary + '25',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  projectIcon: {
    fontSize: 20,
  },
  projectInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  projectName: {
    fontSize: 15,
    fontWeight: '600',
    color: darkTheme.text.primary,
    marginBottom: 2,
  },
  projectNameSelected: {
    color: darkTheme.primaryLight,
  },
  projectPath: {
    fontSize: 11,
    color: darkTheme.text.secondary,
  },
  projectTime: {
    fontSize: 11,
    color: darkTheme.text.disabled,
    marginLeft: 8,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: darkTheme.text.secondary,
  },
  errorText: {
    color: darkTheme.error,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: darkTheme.surfaceElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  retryText: {
    color: darkTheme.primaryLight,
    fontWeight: '600',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.4,
  },
  emptyText: {
    fontSize: 16,
    color: darkTheme.text.secondary,
  },
});
