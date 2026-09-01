use std::fs;
use std::path::PathBuf;
use tauri_app_lib::run;

fn cleanup_stale_instances() {
    #[cfg(target_os = "linux")]
    {
        let pid_path = std::env::temp_dir().join("notch_agent_app.pid");
        let current_pid = std::process::id();

        if let Ok(content) = fs::read_to_string(&pid_path) {
            if let Ok(old_pid) = content.trim().parse::<u32>() {
                if old_pid != current_pid {
                    let proc_cmdline = PathBuf::from(format!("/proc/{}/cmdline", old_pid));
                    if let Ok(cmd) = fs::read_to_string(&proc_cmdline) {
                        // El binario se llama `rimarc`; sin el, cada arranque dejaba viva la
                        // instancia anterior y todas sondeaban la cuota a la vez.
                        if ["rimarc", "tauri-app", "agentnotch"].iter().any(|n| cmd.contains(n)) {
                            eprintln!("Closing previous instance PID: {}", old_pid);
                            let _ = std::process::Command::new("kill")
                                .arg(old_pid.to_string())
                                .output();
                        }
                    }
                }
            }
        }

        let _ = fs::write(&pid_path, current_pid.to_string());
    }
}

fn main() {
    cleanup_stale_instances();

    #[cfg(target_os = "linux")]
    {
        // Linux WebKit & KDE Wayland positioning fix
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        // Use XWayland backend on Wayland so KWin respects exact edge positioning
        if std::env::var("XDG_SESSION_TYPE").unwrap_or_default() == "wayland" {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    run();
}

