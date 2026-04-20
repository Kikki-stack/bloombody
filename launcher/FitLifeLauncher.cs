using System;
using System.Diagnostics;
using System.Linq;
using System.Net.NetworkInformation;
using System.Threading;

internal static class FitLifeLauncher
{
    private const string WorkspacePath = @"C:\Users\holop\Fitness App";
    private const string NodeExePath = @"C:\Program Files\nodejs\node.exe";
    private const string CodeExePath = @"C:\Users\holop\AppData\Local\Programs\Microsoft VS Code\Code.exe";

    private static int Main()
    {
        Console.Title = "FitLife Launcher";
        Console.WriteLine("======================================");
        Console.WriteLine(" FitLife Launcher");
        Console.WriteLine("======================================");
        Console.WriteLine();
        Console.WriteLine("1. Run website (start server + open browser)");
        Console.WriteLine("2. Open project in VS Code + open Chat");
        Console.WriteLine();
        Console.Write("Type 1 or 2, then press Enter: ");

        var choice = Console.ReadLine();

        if (choice == "1")
        {
            RunWebsite();
            Pause();
            return 0;
        }

        if (choice == "2")
        {
            OpenEditor();
            Pause();
            return 0;
        }

        Console.WriteLine();
        Console.WriteLine("Invalid choice. Run again and type 1 or 2.");
        Pause();
        return 1;
    }

    private static void RunWebsite()
    {
        if (!System.IO.File.Exists(NodeExePath))
        {
            Console.WriteLine();
            Console.WriteLine("Node.js was not found at:");
            Console.WriteLine(NodeExePath);
            return;
        }

        int port;
        try
        {
            port = FindFreePort(3000, 3010);
        }
        catch (Exception ex)
        {
            Console.WriteLine();
            Console.WriteLine(ex.Message);
            return;
        }

        var psCommand =
            "Set-Location -Path '" + WorkspacePath + "'; " +
            "$env:PORT=" + port + "; " +
            "& '" + NodeExePath + "' '.\\server.js'";

        var startInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoExit -ExecutionPolicy Bypass -Command \"" + psCommand + "\"",
            UseShellExecute = true,
            WorkingDirectory = WorkspacePath
        };

        Process.Start(startInfo);
        Thread.Sleep(1800);

        var url = "http://localhost:" + port;
        Process.Start(new ProcessStartInfo
        {
            FileName = url,
            UseShellExecute = true
        });

        Console.WriteLine();
        Console.WriteLine("Server started on " + url);
        Console.WriteLine("A new terminal window is running the server.");
    }

    private static void OpenEditor()
    {
        if (!System.IO.File.Exists(CodeExePath))
        {
            Console.WriteLine();
            Console.WriteLine("VS Code was not found at:");
            Console.WriteLine(CodeExePath);
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = CodeExePath,
            Arguments = "\"" + WorkspacePath + "\"",
            UseShellExecute = true
        });

        // Try to focus VS Code and open chat using Ctrl+Alt+I.
        var helper =
            "$ws = New-Object -ComObject WScript.Shell; " +
            "for($i=0; $i -lt 12; $i++){ " +
            "if($ws.AppActivate('Visual Studio Code')){ Start-Sleep -Milliseconds 600; $ws.SendKeys('^%i'); break }; " +
            "Start-Sleep -Milliseconds 500 }";

        Process.Start(new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -Command \"" + helper + "\"",
            UseShellExecute = true
        });

        Console.WriteLine();
        Console.WriteLine("VS Code is opening your project.");
        Console.WriteLine("If chat does not focus automatically, press Ctrl+Alt+I inside VS Code.");
    }

    private static int FindFreePort(int startPort, int endPort)
    {
        var activePorts = IPGlobalProperties
            .GetIPGlobalProperties()
            .GetActiveTcpListeners()
            .Select(endpoint => endpoint.Port)
            .ToHashSet();

        for (var port = startPort; port <= endPort; port++)
        {
            if (!activePorts.Contains(port))
            {
                return port;
            }
        }

        throw new InvalidOperationException("No free port found between " + startPort + " and " + endPort + ".");
    }

    private static void Pause()
    {
        Console.WriteLine();
        Console.Write("Press Enter to close...");
        Console.ReadLine();
    }
}