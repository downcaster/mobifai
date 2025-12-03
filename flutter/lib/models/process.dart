// Types for multi-process terminal management

/// Represents a terminal process
class TerminalProcess {
  /// Unique identifier
  final String uuid;

  /// Timestamp when the process was created
  final int createdAt;

  /// Display label for the tab (e.g., "Tab 1")
  final String label;

  const TerminalProcess({
    required this.uuid,
    required this.createdAt,
    required this.label,
  });

  factory TerminalProcess.fromJson(Map<String, dynamic> json) {
    return TerminalProcess(
      uuid: json['uuid'] as String,
      createdAt: json['createdAt'] as int,
      label: json['label'] as String? ?? json['name'] as String? ?? 'Tab',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'uuid': uuid,
      'createdAt': createdAt,
      'label': label,
    };
  }

  TerminalProcess copyWith({
    String? uuid,
    int? createdAt,
    String? label,
  }) {
    return TerminalProcess(
      uuid: uuid ?? this.uuid,
      createdAt: createdAt ?? this.createdAt,
      label: label ?? this.label,
    );
  }
}

/// Payload for process:create command (Mobile -> Mac)
class ProcessCreatePayload {
  final String uuid;
  final String? name;
  final int? cols;
  final int? rows;

  const ProcessCreatePayload({
    required this.uuid,
    this.name,
    this.cols,
    this.rows,
  });

  Map<String, dynamic> toJson() {
    return {
      'uuid': uuid,
      if (name != null) 'name': name,
      if (cols != null) 'cols': cols,
      if (rows != null) 'rows': rows,
    };
  }
}

/// Payload for process:terminate command (Mobile -> Mac)
class ProcessTerminatePayload {
  final String uuid;

  const ProcessTerminatePayload({required this.uuid});

  Map<String, dynamic> toJson() => {'uuid': uuid};
}

/// Payload for process:switch command (Mobile -> Mac)
class ProcessSwitchPayload {
  final List<String> activeUuids;

  const ProcessSwitchPayload({required this.activeUuids});

  Map<String, dynamic> toJson() => {'activeUuids': activeUuids};
}

/// Payload for process:created event (Mac -> Mobile)
class ProcessCreatedPayload {
  final String uuid;
  final String? name;

  const ProcessCreatedPayload({required this.uuid, this.name});

  factory ProcessCreatedPayload.fromJson(Map<String, dynamic> json) {
    return ProcessCreatedPayload(
      uuid: json['uuid'] as String,
      name: json['name'] as String?,
    );
  }
}

/// Payload for process:rename command (Mobile -> Mac)
class ProcessRenamePayload {
  final String uuid;
  final String name;

  const ProcessRenamePayload({required this.uuid, required this.name});

  Map<String, dynamic> toJson() => {'uuid': uuid, 'name': name};
}

/// Process data for sync (Mac -> Mobile on reconnection)
class ProcessSyncData {
  final String uuid;
  final String name;
  final int createdAt;

  const ProcessSyncData({
    required this.uuid,
    required this.name,
    required this.createdAt,
  });

  factory ProcessSyncData.fromJson(Map<String, dynamic> json) {
    return ProcessSyncData(
      uuid: json['uuid'] as String,
      name: json['name'] as String,
      createdAt: json['createdAt'] as int,
    );
  }
}

/// Payload for processes:sync event (Mac -> Mobile)
class ProcessesSyncPayload {
  final List<ProcessSyncData> processes;
  final List<String> activeUuids;

  const ProcessesSyncPayload({
    required this.processes,
    required this.activeUuids,
  });

  factory ProcessesSyncPayload.fromJson(Map<String, dynamic> json) {
    final processesList = (json['processes'] as List<dynamic>)
        .map((p) => ProcessSyncData.fromJson(p as Map<String, dynamic>))
        .toList();
    final activeUuids = (json['activeUuids'] as List<dynamic>)
        .map((u) => u as String)
        .toList();
    return ProcessesSyncPayload(
      processes: processesList,
      activeUuids: activeUuids,
    );
  }
}

/// Payload for process:exited event (Mac -> Mobile)
class ProcessExitedPayload {
  final String uuid;

  const ProcessExitedPayload({required this.uuid});

  factory ProcessExitedPayload.fromJson(Map<String, dynamic> json) {
    return ProcessExitedPayload(uuid: json['uuid'] as String);
  }
}

/// Payload for process:screen event (Mac -> Mobile)
class ProcessScreenPayload {
  final String uuid;
  final String data;

  const ProcessScreenPayload({required this.uuid, required this.data});

  factory ProcessScreenPayload.fromJson(Map<String, dynamic> json) {
    return ProcessScreenPayload(
      uuid: json['uuid'] as String,
      data: json['data'] as String,
    );
  }
}

/// Payload for process:error event (Mac -> Mobile)
class ProcessErrorPayload {
  final String uuid;
  final String error;

  const ProcessErrorPayload({required this.uuid, required this.error});

  factory ProcessErrorPayload.fromJson(Map<String, dynamic> json) {
    return ProcessErrorPayload(
      uuid: json['uuid'] as String,
      error: json['error'] as String,
    );
  }
}

/// Payload for terminal:input command with process uuid (Mobile -> Mac)
class TerminalInputPayload {
  final String uuid;
  final String data;

  const TerminalInputPayload({required this.uuid, required this.data});

  Map<String, dynamic> toJson() => {'uuid': uuid, 'data': data};
}

/// Payload for terminal:output event with process uuid (Mac -> Mobile)
class TerminalOutputPayload {
  final String uuid;
  final String data;

  const TerminalOutputPayload({required this.uuid, required this.data});

  factory TerminalOutputPayload.fromJson(Map<String, dynamic> json) {
    return TerminalOutputPayload(
      uuid: json['uuid'] as String,
      data: json['data'] as String,
    );
  }
}

/// Payload for terminal:resize command
class TerminalResizePayload {
  final String? uuid;
  final int cols;
  final int rows;

  const TerminalResizePayload({
    this.uuid,
    required this.cols,
    required this.rows,
  });

  Map<String, dynamic> toJson() {
    return {
      if (uuid != null) 'uuid': uuid,
      'cols': cols,
      'rows': rows,
    };
  }
}

/// Available device info
class AvailableDevice {
  final String deviceId;
  final String deviceName;
  final String status;
  final int? tabCount;

  const AvailableDevice({
    required this.deviceId,
    required this.deviceName,
    required this.status,
    this.tabCount,
  });

  factory AvailableDevice.fromJson(Map<String, dynamic> json) {
    return AvailableDevice(
      deviceId: json['deviceId'] as String,
      deviceName: json['deviceName'] as String,
      status: json['status'] as String,
      tabCount: json['tabCount'] as int?,
    );
  }
}

/// Connection status for persistence
class ConnectionStatus {
  final String deviceId;
  final String status; // 'connecting' | 'connected'

  const ConnectionStatus({
    required this.deviceId,
    required this.status,
  });

  factory ConnectionStatus.fromJson(Map<String, dynamic> json) {
    return ConnectionStatus(
      deviceId: json['deviceId'] as String,
      status: json['status'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'deviceId': deviceId,
      'status': status,
    };
  }
}

/// User info for profile
class UserInfo {
  final String email;
  final String? name;
  final String? picture;

  const UserInfo({
    required this.email,
    this.name,
    this.picture,
  });

  factory UserInfo.fromJson(Map<String, dynamic> json) {
    return UserInfo(
      email: json['email'] as String,
      name: json['name'] as String?,
      picture: json['picture'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'email': email,
      if (name != null) 'name': name,
      if (picture != null) 'picture': picture,
    };
  }
}

