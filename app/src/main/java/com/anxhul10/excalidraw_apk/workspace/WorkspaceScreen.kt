package com.anxhul10.excalidraw_apk.workspace


package com.anxhul10.excalidraw_apk

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun WorkspaceScreen(
    workspaces: List<String>,
    onCreateWorkspace: (String) -> Unit,
    onSelectWorkspace: (String) -> Unit
) {
    var showCreateDialog by remember {
        mutableStateOf(false)
    }

    var showWorkspaceList by remember {
        mutableStateOf(false)
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center
        ) {

            Text(
                text = "Welcome to Excalidraw",
                style = MaterialTheme.typography.headlineMedium
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Create a workspace or continue with an existing one.",
                style = MaterialTheme.typography.bodyMedium
            )

            Spacer(modifier = Modifier.height(32.dp))

            Button(
                onClick = {
                    showCreateDialog = true
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Create Workspace")
            }

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedButton(
                onClick = {
                    showWorkspaceList = true
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = workspaces.isNotEmpty()
            ) {
                Text("Choose Workspace")
            }

            if (workspaces.isEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = "You haven't created any workspaces yet.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }

    if (showCreateDialog) {
        CreateWorkspaceDialog(
            onDismiss = {
                showCreateDialog = false
            },
            onCreate = { name ->
                onCreateWorkspace(name)
                showCreateDialog = false
            }
        )
    }

    if (showWorkspaceList) {
        AlertDialog(
            onDismissRequest = {
                showWorkspaceList = false
            },
            title = {
                Text("Choose Workspace")
            },
            text = {
                LazyColumn {
                    items(workspaces) { workspace ->
                        TextButton(
                            onClick = {
                                showWorkspaceList = false
                                onSelectWorkspace(workspace)
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(workspace)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showWorkspaceList = false
                    }
                ) {
                    Text("Close")
                }
            }
        )
    }
}

@Composable
fun CreateWorkspaceDialog(
    onDismiss: () -> Unit,
    onCreate: (String) -> Unit
) {
    var workspaceName by remember {
        mutableStateOf("")
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Create Workspace")
        },
        text = {
            OutlinedTextField(
                value = workspaceName,
                onValueChange = {
                    workspaceName = it
                },
                label = {
                    Text("Workspace name")
                },
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val name = workspaceName.trim()
                    if (name.isNotEmpty()) {
                        onCreate(name)
                    }
                },
                enabled = workspaceName.isNotBlank()
            ) {
                Text("Create")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
