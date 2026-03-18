"use client";

import { useState } from "react";
import {
  Settings,
  Palette,
  CalendarDays,
  Layers,
  BookOpen,
  Sliders,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GeneralTab } from "./tabs/general-tab";
import { BrandingTab } from "./tabs/branding-tab";
import { AcademicTab } from "./tabs/academic-tab";
import { ClassesTab } from "./tabs/classes-tab";
import { SubjectsTab } from "./tabs/subjects-tab";
import { SystemTab } from "./tabs/system-tab";
import { DataExportTab } from "./tabs/data-export-tab";

const TABS = [
  { key: "general", label: "General", icon: Settings },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "academic", label: "Academic", icon: CalendarDays },
  { key: "classes", label: "Classes", icon: Layers },
  { key: "subjects", label: "Subjects", icon: BookOpen },
  { key: "system", label: "System", icon: Sliders },
  { key: "export", label: "Data Export", icon: Download },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  const renderTab = () => {
    switch (activeTab) {
      case "general": return <GeneralTab />;
      case "branding": return <BrandingTab />;
      case "academic": return <AcademicTab />;
      case "classes": return <ClassesTab />;
      case "subjects": return <SubjectsTab />;
      case "system": return <SystemTab />;
      case "export": return <DataExportTab />;
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">School Settings</h1>
        <p className="mt-1 text-sm text-muted">Configure your school&apos;s settings</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="w-52 shrink-0">
          <nav className="space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  activeTab === tab.key
                    ? "bg-accent text-primary"
                    : "text-muted hover:bg-accent-light hover:text-foreground"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-w-0">{renderTab()}</div>
      </div>
    </div>
  );
}
