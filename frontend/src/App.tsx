import { BrowserRouter, Routes, Route } from "react-router-dom";
import VMs from "./pages/VMs";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Audit from "./pages/Audit";
import Layout from "./components/layout/Layout";
import AuthGate from "./pages/AuthGate";
export default function App() {
  return (
    <AuthGate>
      <BrowserRouter>
       <Layout>
        <Routes>
          <Route path="/" element={<VMs />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/audit" element={<Audit />} />
        </Routes>
      </Layout>
      </BrowserRouter>
    </AuthGate>
  );
}
