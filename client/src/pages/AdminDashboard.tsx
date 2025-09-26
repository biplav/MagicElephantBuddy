import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Users, User, Baby, TrendingUp, BookOpen, Target, Clock, CheckCircle, Plus, X } from 'lucide-react';

interface Child {
  id: string;
  name: string;
  age: number;
  isActive: boolean;
  milestonesCount: number;
  conversationsCount: number;
  completedMilestones: number;
  createdAt: string;
}

interface Parent {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

interface User {
  parent: Parent;
  children: Child[];
  totalChildren: number;
}

interface AdminData {
  users: User[];
  totalParents: number;
  totalChildren: number;
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('demo@parent.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set());

  // Create parent form state
  const [showCreateParentForm, setShowCreateParentForm] = useState(false);
  const [createParentForm, setCreateParentForm] = useState({
    name: '',
    email: '',
    password: ''
  });
  const [createParentLoading, setCreateParentLoading] = useState(false);

  // Create child form state
  const [showCreateChildForm, setShowCreateChildForm] = useState<number | null>(null);
  const [createChildForm, setCreateChildForm] = useState({
    name: '',
    nickname: '',
    age: '',
    interests: '',
    learningGoals: ''
  });
  const [createChildLoading, setCreateChildLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok && data.admin) {
        setIsAuthenticated(true);
        await fetchAdminData();
      } else {
        setError(data.error || 'Admin login failed');
      }
    } catch (error) {
      setError('Network error during login');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        setAdminData(data);
      } else {
        setError(data.error || 'Failed to fetch admin data');
      }
    } catch (error) {
      setError('Network error fetching data');
    }
  };

  const toggleUserExpanded = (parentId: number) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(parentId)) {
      newExpanded.delete(parentId);
    } else {
      newExpanded.add(parentId);
    }
    setExpandedUsers(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Create parent handler
  const handleCreateParent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateParentLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/create-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, // admin email for authentication
          name: createParentForm.name,
          parentEmail: createParentForm.email, // new parent email
          parentPassword: createParentForm.password
        })
      });

      const data = await response.json();

      if (response.ok) {
        setCreateParentForm({ name: '', email: '', password: '' });
        setShowCreateParentForm(false);
        await fetchAdminData(); // Refresh data
        setError(''); // Clear any previous errors
      } else {
        setError(data.error || 'Failed to create parent');
      }
    } catch (error) {
      setError('Network error while creating parent');
    } finally {
      setCreateParentLoading(false);
    }
  };

  // Create child handler
  const handleCreateChild = async (e: React.FormEvent, parentId: number) => {
    e.preventDefault();
    setCreateChildLoading(true);
    setError('');

    try {
      const interests = createChildForm.interests.split(',').map(i => i.trim()).filter(i => i);
      const learningGoals = createChildForm.learningGoals.split(',').map(g => g.trim()).filter(g => g);

      const response = await fetch('/api/admin/create-child', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          parentId,
          name: createChildForm.name,
          nickname: createChildForm.nickname,
          age: parseInt(createChildForm.age),
          interests,
          learningGoals
        })
      });

      const data = await response.json();

      if (response.ok) {
        setCreateChildForm({ name: '', nickname: '', age: '', interests: '', learningGoals: '' });
        setShowCreateChildForm(null);
        await fetchAdminData(); // Refresh data
        setError(''); // Clear any previous errors
      } else {
        setError(data.error || 'Failed to create child');
      }
    } catch (error) {
      setError('Network error while creating child');
    } finally {
      setCreateChildLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-2">Secure access for administrators</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Admin Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="admin@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter password"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Signing In...' : 'Sign In to Admin'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setLocation('/')}
              className="inline-flex items-center text-indigo-600 hover:text-indigo-700 text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!adminData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mr-4">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-gray-600">System overview and user management</p>
              </div>
            </div>
            <button
              onClick={() => setLocation('/')}
              className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-gray-600 text-sm">Total Parents</p>
                <p className="text-2xl font-bold text-gray-900">{adminData.totalParents}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Baby className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-gray-600 text-sm">Total Children</p>
                <p className="text-2xl font-bold text-gray-900">{adminData.totalChildren}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-gray-600 text-sm">Active Families</p>
                <p className="text-2xl font-bold text-gray-900">
                  {adminData.users.filter(user => user.children.length > 0).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Users List */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">All Users & Children</h2>
                <p className="text-gray-600 text-sm mt-1">Complete overview of all families using the platform</p>
              </div>
              <button
                onClick={() => setShowCreateParentForm(true)}
                className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Parent
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {adminData.users.map((user) => (
              <div key={user.parent.id} className="p-6">
                {/* Parent Info */}
                <div
                  className="flex items-center justify-between cursor-pointer hover:bg-gray-50 -mx-6 px-6 py-3 rounded-lg transition-colors"
                  onClick={() => toggleUserExpanded(user.parent.id)}
                >
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="ml-4">
                      <p className="font-semibold text-gray-900">{user.parent.name}</p>
                      <p className="text-gray-600 text-sm">{user.parent.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {user.totalChildren} {user.totalChildren === 1 ? 'Child' : 'Children'}
                    </p>
                    <p className="text-xs text-gray-500">Joined {formatDate(user.parent.createdAt)}</p>
                  </div>
                </div>

                {/* Children Details */}
                {expandedUsers.has(user.parent.id) && (
                  <div className="mt-4 ml-14 space-y-3">
                    {user.children.length > 0 && user.children.map((child) => (
                      <div key={child.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center">
                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                              <Baby className="w-4 h-4 text-green-600" />
                            </div>
                            <div className="ml-3">
                              <p className="font-medium text-gray-900">{child.name}</p>
                              <p className="text-sm text-gray-600">{child.age} years old</p>
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-500">
                            <p>Created {formatDate(child.createdAt)}</p>
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                              child.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {child.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>

                        {/* Child Stats */}
                        <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-gray-200">
                          <div className="text-center">
                            <div className="flex items-center justify-center mb-1">
                              <Target className="w-4 h-4 text-blue-500 mr-1" />
                              <span className="text-sm font-medium text-blue-600">
                                {child.milestonesCount}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600">Milestones</p>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center mb-1">
                              <BookOpen className="w-4 h-4 text-green-500 mr-1" />
                              <span className="text-sm font-medium text-green-600">
                                {child.conversationsCount}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600">Conversations</p>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center mb-1">
                              <CheckCircle className="w-4 h-4 text-purple-500 mr-1" />
                              <span className="text-sm font-medium text-purple-600">
                                {child.completedMilestones}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600">Completed</p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Add Child Button */}
                    <button
                      onClick={() => setShowCreateChildForm(user.parent.id)}
                      className="inline-flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Child
                    </button>

                    {user.children.length === 0 && (
                      <div className="text-gray-500 text-sm italic">
                        No children registered yet
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {adminData.users.length === 0 && (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No users found</p>
              <p className="text-gray-400 text-sm">Users will appear here once they register</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Parent Modal */}
      {showCreateParentForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Create New Parent</h3>
              <button
                onClick={() => setShowCreateParentForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateParent} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Parent Name
                </label>
                <input
                  type="text"
                  value={createParentForm.name}
                  onChange={(e) => setCreateParentForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter parent name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={createParentForm.email}
                  onChange={(e) => setCreateParentForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter email address"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={createParentForm.password}
                  onChange={(e) => setCreateParentForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter password"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateParentForm(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createParentLoading}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {createParentLoading ? 'Creating...' : 'Create Parent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Child Modal */}
      {showCreateChildForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Add New Child</h3>
              <button
                onClick={() => setShowCreateChildForm(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => handleCreateChild(e, showCreateChildForm)} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Child Name
                </label>
                <input
                  type="text"
                  value={createChildForm.name}
                  onChange={(e) => setCreateChildForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter child name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nickname
                </label>
                <input
                  type="text"
                  value={createChildForm.nickname}
                  onChange={(e) => setCreateChildForm(prev => ({ ...prev, nickname: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter nickname (optional)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Age
                </label>
                <input
                  type="number"
                  min="1"
                  max="18"
                  value={createChildForm.age}
                  onChange={(e) => setCreateChildForm(prev => ({ ...prev, age: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter age"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Interests (comma-separated)
                </label>
                <input
                  type="text"
                  value={createChildForm.interests}
                  onChange={(e) => setCreateChildForm(prev => ({ ...prev, interests: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., animals, books, music"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Learning Goals (comma-separated)
                </label>
                <input
                  type="text"
                  value={createChildForm.learningGoals}
                  onChange={(e) => setCreateChildForm(prev => ({ ...prev, learningGoals: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., reading, counting, colors"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateChildForm(null)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createChildLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {createChildLoading ? 'Creating...' : 'Add Child'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}