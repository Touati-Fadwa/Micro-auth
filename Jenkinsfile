pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-auth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
    KUBE_TIMEOUT = "600" // Augmentation du timeout à 10 minutes
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('microservice-auth') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('microservice-auth') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm test -- --coverage'
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f ./Dockerfile ."
        }
      }
    }

    stage('Docker Login & Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-hub-credentials',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin $REGISTRY
            docker push ${IMAGE_NAME}:${IMAGE_TAG}
          '''
        }
      }
    }

    stage('Prepare K3s Environment') {
      steps {
        script {
          withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              mkdir -p ~/.kube
              cp $KUBECONFIG_FILE ~/.kube/config
              chmod 600 ~/.kube/config
              
              # Création du namespace s'il n'existe pas
              if ! kubectl get namespace $KUBE_NAMESPACE >/dev/null 2>&1; then
                kubectl create namespace $KUBE_NAMESPACE
              fi
              
              # Vérification de l'accès au cluster
              kubectl cluster-info
              kubectl get nodes
            '''
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              mkdir -p ~/.kube
              cp $KUBECONFIG_FILE ~/.kube/config
              chmod 600 ~/.kube/config
              
              kubectl config set-context --current --namespace=$KUBE_NAMESPACE
              
              # Application des manifests avec vérification
              kubectl apply -f k8s/bibliotheque-auth-deployment.yaml
              kubectl apply -f k8s/bibliotheque-auth-service.yaml
              
              # Vérification immédiate des ressources créées
              kubectl get deployment,svc,pods -n $KUBE_NAMESPACE
            '''
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        retry(3) {
          timeout(time: 10, unit: 'MINUTES') { // Timeout augmenté
            withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
              sh '''
                mkdir -p ~/.kube
                cp $KUBECONFIG_FILE ~/.kube/config
                chmod 600 ~/.kube/config
                
                # Vérification du déploiement avec timeout augmenté
                kubectl rollout status deployment/bibliotheque-auth \
                  --namespace=$KUBE_NAMESPACE \
                  --timeout=${KUBE_TIMEOUT}s
                
                # Vérification supplémentaire des pods
                kubectl get pods -n $KUBE_NAMESPACE -o wide
              '''
            }
          }
        }
      }
    }

    stage('Debug if Needed') {
      steps {
        script {
          withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              mkdir -p ~/.kube
              cp $KUBECONFIG_FILE ~/.kube/config
              chmod 600 ~/.kube/config
              
              # Affichage des logs en cas de problème
              for pod in $(kubectl get pods -n $KUBE_NAMESPACE -l app=bibliotheque-auth -o jsonpath='{.items[*].metadata.name}'); do
                echo "=== Logs for pod $pod ==="
                kubectl logs $pod -n $KUBE_NAMESPACE || true
                echo "=== Describe pod $pod ==="
                kubectl describe pod $pod -n $KUBE_NAMESPACE || true
              done
            '''
          }
        }
      }
    }
  }

  post {
    failure {
      script {
        echo "Pipeline failed! Attempting rollback and debug..."
        withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            mkdir -p ~/.kube
            cp $KUBECONFIG_FILE ~/.kube/config
            chmod 600 ~/.kube/config
            
            # Rollback du déploiement
            if kubectl get deployment bibliotheque-auth -n $KUBE_NAMESPACE >/dev/null 2>&1; then
              kubectl rollout undo deployment/bibliotheque-auth -n $KUBE_NAMESPACE || true
            fi
            
            # Affichage des informations de debug
            echo "=== Debug Information ==="
            kubectl get all -n $KUBE_NAMESPACE
            kubectl describe deployment bibliotheque-auth -n $KUBE_NAMESPACE || true
            kubectl get events -n $KUBE_NAMESPACE --sort-by='.metadata.creationTimestamp' || true
          '''
        }
      }
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed"
    }
  }
}