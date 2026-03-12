import os
import sys
import subprocess
import shutil

def main():
    print("=== Starting Backend Build for Windows ===")
    
    # Ensure PyInstaller is installed
    try:
        import pyinstaller
    except ImportError:
        print("PyInstaller not found. Installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
    
    # Define paths
    current_dir = os.path.dirname(os.path.abspath(__file__))
    main_script = os.path.join(current_dir, "main.py")
    dist_dir = os.path.join(current_dir, "dist")
    
    # Note: Modify --add-data based on requirements if you need to copy templates, static files, etc.
    # e.g., '--add-data', 'templates:templates'
    
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onedir", # Use onedir instead of onefile for better performance and debugging
        "--windowed", # Hide console window for FastAPI backend
        "--name", "backend",
        main_script
    ]
    
    print(f"Running command: {' '.join(command)}")
    result = subprocess.run(command, cwd=current_dir)
    
    if result.returncode == 0:
        print("Backend built successfully!")
        
        # Determine the target directory in the frontend project
        frontend_resources_dir = os.path.join(current_dir, "..", "policyevaluationGOS", "resources")
        
        # If building on Windows (actually doing it), you might want to copy it automatically
        if sys.platform.startswith('win'):
            print(f"Copying backend executable to {frontend_resources_dir}")
            os.makedirs(frontend_resources_dir, exist_ok=True)
            
            src_exe_dir = os.path.join(dist_dir, "backend")
            dst_exe_dir = os.path.join(frontend_resources_dir, "backend")
            
            if os.path.exists(dst_exe_dir):
                shutil.rmtree(dst_exe_dir)
                
            shutil.copytree(src_exe_dir, dst_exe_dir)
            print("Copy complete!")
        else:
            print("Note: Fast build logic detected non-Windows platform. Remember to build this on Windows to generate the actual .exe.")
    else:
        print("Build failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
