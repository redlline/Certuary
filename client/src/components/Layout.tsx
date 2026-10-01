import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  CloudUpload,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  ServerCog,
  Settings,
  Sun,
  Terminal,
  TriangleAlert,
  X,
} from "lucide-react";
import { api } from "../api";
import { useTheme } from "../hooks/useTheme";
import { Logo } from "./Logo";

function NavItem({
  to,
  icon,
  label,
  onNavigate,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition ${
          isActive ? "" : "hover:bg-[rgba(255,255,255,0.04)]"
        }`
      }
      style={({ isActive }) =>
        isActive
          ? { background: "var(--accent-soft)", color: "var(--text-h)" }
          : { color: "var(--text-dim)" }
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

export function Layout() {
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await api.logout();
    window.location.reload();
  }

  const nav = (
    <>
      <NavItem to="/" icon={<LayoutDashboard size={16} />} label="Дашборд" onNavigate={() => setMenuOpen(false)} />
      <NavItem to="/servers" icon={<ServerCog size={16} />} label="Серверы" onNavigate={() => setMenuOpen(false)} />
      <NavItem to="/expiring" icon={<TriangleAlert size={16} />} label="Все истекающие" onNavigate={() => setMenuOpen(false)} />
      <NavItem to="/bulk-upload" icon={<CloudUpload size={16} />} label="Загрузка пачкой" onNavigate={() => setMenuOpen(false)} />
      <NavItem to="/events" icon={<ScrollText size={16} />} label="Журнал событий" onNavigate={() => setMenuOpen(false)} />
      <NavItem to="/logs" icon={<Terminal size={16} />} label="Логи системы" onNavigate={() => setMenuOpen(false)} />
      <NavItem to="/settings" icon={<Settings size={16} />} label="Настройки" onNavigate={() => setMenuOpen(false)} />
    </>
  );

  const footerButtons = (
    <>
      <button
        onClick={toggleTheme}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[var(--text-dim)] hover:bg-[rgba(255,255,255,0.04)]"
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      </button>
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[var(--text-dim)] hover:bg-[rgba(255,255,255,0.04)]"
      >
        <LogOut size={16} /> Выйти
      </button>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <header
        className="flex md:hidden items-center justify-between px-4 py-3 shrink-0"
        style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span className="font-semibold text-[var(--text-h)] text-sm">Certuary</span>
        </div>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="text-[var(--text-h)] p-1"
          aria-label="Меню"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {menuOpen && (
        <div
          className="md:hidden flex flex-col gap-1 p-3"
          style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}
        >
          {nav}
          <div className="flex flex-col gap-1 mt-1 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
            {footerButtons}
          </div>
        </div>
      )}

      <aside
        className="hidden md:flex w-56 shrink-0 flex-col gap-1 p-4"
        style={{ background: "var(--bg-elevated)", borderRight: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 px-2 py-3 mb-2">
          <Logo size={22} />
          <span className="font-semibold text-[var(--text-h)]">Certuary</span>
        </div>
        {nav}
        <div className="mt-auto flex flex-col gap-1">{footerButtons}</div>
      </aside>

      <main className="flex-1 p-4 md:p-6 overflow-y-auto md:max-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
