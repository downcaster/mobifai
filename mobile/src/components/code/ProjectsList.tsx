import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { AppText, AppCard } from '../ui';
import { colors } from '../../theme/colors';
import { CodeProject } from '../../types/code';
import { useProjectsHistory } from '../../hooks/useCodeQueries';

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
        <ActivityIndicator size="large" color={colors.primary} />
        <AppText style={styles.loadingText}>Loading projects...</AppText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <AppText style={styles.errorText}>Failed to load projects</AppText>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <AppText style={styles.retryText}>Retry</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <AppText style={styles.emptyIcon}>📂</AppText>
        <AppText style={styles.emptyText}>No projects yet</AppText>
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
          >
            <AppCard
              style={[styles.projectCard, isSelected && styles.projectCardSelected]}
            >
              <View style={styles.projectIconContainer}>
                <AppText style={styles.projectIcon}>📂</AppText>
              </View>
              <View style={styles.projectInfo}>
                <AppText
                  style={[
                    styles.projectName,
                    isSelected && styles.projectNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {project.name}
                </AppText>
                <AppText style={styles.projectPath} numberOfLines={1}>
                  {project.path}
                </AppText>
              </View>
              <AppText style={styles.projectTime}>{timeAgo}</AppText>
            </AppCard>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/**
 * Get human-readable time ago string
 */
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
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.background,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  projectCardSelected: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  projectIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.primary + '12',
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
    color: colors.text.primary,
    marginBottom: 2,
  },
  projectNameSelected: {
    color: colors.primary,
  },
  projectPath: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  projectTime: {
    fontSize: 11,
    color: colors.text.disabled,
    marginLeft: 8,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.text.secondary,
  },
  errorText: {
    color: colors.error,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  retryText: {
    color: colors.text.inverse,
    fontWeight: '600',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.4,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text.secondary,
  },
});
